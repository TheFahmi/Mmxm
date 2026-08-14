//+------------------------------------------------------------------+
//| MMXMBridgeEA.mq5 — signal-only data bridge. NEVER trades.        |
//+------------------------------------------------------------------+
#property copyright "MMXM"
#property version   "1.00"
#property strict

#include "../Include/MmxmHttpClient.mqh"
#include "../Include/MmxmJsonBuilder.mqh"
#include "../Include/MmxmQueue.mqh"
#include "../Include/MmxmCandleSync.mqh"

// ---- Inputs ----
input string ApiBaseUrl  = "https://api.example.com/api/v1";
input string ApiKey      = "";
input string ApiSecret   = "";

input string CanonicalSymbol      = "XAUUSD";
input string BrokerSymbolOverride = "";

input int FlushIntervalMs          = 500;
input int HeartbeatIntervalSeconds = 5;
input int RequestTimeoutMs         = 3000;
input int MaximumBatchSize         = 100;

input bool SendTicks          = true;
input bool SendCurrentCandles = true;
input bool SendClosedCandles  = true;
input bool SynchronizeHistoryOnStart = true;

input int InitialM1Bars  = 45000;
input int InitialM5Bars  = 10000;
input int InitialM15Bars = 5000;
input int InitialH1Bars  = 3000;
input int InitialH4Bars  = 1500;
input int InitialD1Bars  = 1000;

input bool EnableLocalSpool   = true;
input int  MaximumRetryCount  = 10;
input int  MaxTickSpoolSize   = 5000;
input int  MaxCandleSpoolSize = 50000;

// ---- Globals ----
string            g_brokerSymbol;
string            g_terminalId;
string            g_accountIdHash;
string            g_connectionId;
bool              g_historySyncDone = false;
int               g_flushTimerMs;
datetime          g_lastHeartbeatAt = 0;
datetime          g_lastTickAt = 0;
datetime          g_lastSuccessAt = 0;
int               g_backoffSeconds = 1;

CMmxmHttpClient  g_http;
CMmxmCandleSync  g_sync;
CMmxmQueue       g_tickQueue;
CMmxmQueue       g_closedCandleQueue;
CMmxmQueue       g_currentCandleQueue;
CMmxmSpool       g_spoolTicks;
CMmxmSpool       g_spoolCandles;

//+------------------------------------------------------------------+
//| Helpers                                                          |
//+------------------------------------------------------------------+
string LoadOrCreateTerminalId()
{
   string fname = "mmxm_terminal_id.txt";
   int h = FileOpen(fname, FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON);
   if(h != INVALID_HANDLE)
   {
      string id = FileReadString(h);
      FileClose(h);
      if(StringLen(id) >= 32) return id;
   }
   string id = MmxmNewUuid();
   h = FileOpen(fname, FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON);
   if(h != INVALID_HANDLE) { FileWriteString(h, id); FileClose(h); }
   return id;
}

string HashAccountId()
{
   long acc = AccountInfoInteger(ACCOUNT_LOGIN);
   string raw = StringFormat("%I64d", acc) + "|" + AccountInfoString(ACCOUNT_SERVER);
   uchar data[];
   MmxmStringToBytes(raw, data);
   CSha256 h;
   h.Update(data, ArraySize(data));
   uchar digest[];
   h.Final(digest);
   return MmxmBytesToHex(digest);
}

void ChartStatus(const string msg)
{
   Comment("MMXM Bridge [" + g_brokerSymbol + "]\n" +
           "TerminalId: " + StringSubstr(g_terminalId,0,8) + "...\n" +
           "ConnId: " + (g_connectionId=="" ? "-" : StringSubstr(g_connectionId,0,8)) + "\n" +
           msg);
}

//+------------------------------------------------------------------+
//| OnInit                                                           |
//+------------------------------------------------------------------+
int OnInit()
{
   // Resolve broker symbol
   g_brokerSymbol = (BrokerSymbolOverride != "" ? BrokerSymbolOverride : _Symbol);
   if(!SymbolSelect(g_brokerSymbol, true))
   {
      Print("MMXM: symbol not available: ", g_brokerSymbol);
      return INIT_FAILED;
   }

   g_terminalId = LoadOrCreateTerminalId();
   g_accountIdHash = HashAccountId();

   g_http.Init(ApiBaseUrl, ApiKey, ApiSecret, g_terminalId, RequestTimeoutMs);
   g_sync.Init(g_brokerSymbol);

   g_tickQueue.Init("ticks", MaxTickSpoolSize);
   g_closedCandleQueue.Init("closedCandles", MaxCandleSpoolSize);
   g_currentCandleQueue.Init("currentCandles", 0);

   g_spoolTicks.Init(g_terminalId, "ticks");
   g_spoolCandles.Init(g_terminalId, "candles");

   if(!SendHandshake())
   {
      ChartStatus("Handshake FAILED — check API URL allowed + credentials. Will retry from OnTimer.");
      // do not fail init; retry in OnTimer
   }

   g_sync.ResetBaseline();
   EventSetMillisecondTimer(FlushIntervalMs);
   ChartStatus("Bridge online. History sync queued.");
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Handshake                                                        |
//+------------------------------------------------------------------+
bool SendHandshake()
{
   string m[];
   ArrayResize(m, 21);
   m[0]  = MmxmJsonStr("terminalId", g_terminalId);
   m[1]  = MmxmJsonStr("terminalName", "MetaTrader 5");
   m[2]  = MmxmJsonInt("terminalBuild", (long)TerminalInfoInteger(TERMINAL_BUILD));
   m[3]  = MmxmJsonStr("brokerName", AccountInfoString(ACCOUNT_COMPANY));
   m[4]  = MmxmJsonStr("serverName", AccountInfoString(ACCOUNT_SERVER));
   m[5]  = MmxmJsonStr("accountIdHash", g_accountIdHash);
   m[6]  = MmxmJsonStr("accountCurrency", AccountInfoString(ACCOUNT_CURRENCY));
   m[7]  = MmxmJsonStr("canonicalSymbol", CanonicalSymbol);
   m[8]  = MmxmJsonStr("brokerSymbol", g_brokerSymbol);
   m[9]  = MmxmJsonInt("digits", SymbolInfoInteger(g_brokerSymbol, SYMBOL_DIGITS));
   m[10] = MmxmJsonNum("point", SymbolInfoDouble(g_brokerSymbol, SYMBOL_POINT), 8);
   m[11] = MmxmJsonNum("tickSize", SymbolInfoDouble(g_brokerSymbol, SYMBOL_TRADE_TICK_SIZE), 8);
   m[12] = MmxmJsonNum("tickValue", SymbolInfoDouble(g_brokerSymbol, SYMBOL_TRADE_TICK_VALUE), 8);
   m[13] = MmxmJsonNum("contractSize", SymbolInfoDouble(g_brokerSymbol, SYMBOL_TRADE_CONTRACT_SIZE), 2);
   m[14] = MmxmJsonNum("minimumVolume", SymbolInfoDouble(g_brokerSymbol, SYMBOL_VOLUME_MIN), 8);
   m[15] = MmxmJsonNum("maximumVolume", SymbolInfoDouble(g_brokerSymbol, SYMBOL_VOLUME_MAX), 2);
   m[16] = MmxmJsonNum("volumeStep", SymbolInfoDouble(g_brokerSymbol, SYMBOL_VOLUME_STEP), 8);
   m[17] = MmxmJsonStr("serverTime", MmxmIsoFromDatetime(TimeTradeServer()));
   m[18] = MmxmJsonStr("localTime", MmxmIsoFromDatetime(TimeGMT()));
   m[19] = MmxmJsonStr("canonicalSymbolDup", CanonicalSymbol); // keep count odd->even stable; backend ignores
   m[20] = MmxmJsonInt("schemaVersion", 1);

   string body = MmxmJsonObj(m, 21);
   string resp;
   int status = g_http.Post("/mql5/handshake", body, resp);
   if(status == 200 && StringFind(resp, "\"success\":true") >= 0)
   {
      g_lastSuccessAt = TimeGMT();
      g_backoffSeconds = 1;
      // naive connectionId extraction
      int p = StringFind(resp, "\"connectionId\":\"");
      if(p >= 0)
      {
         int s = p + 16;
         int e = StringFind(resp, "\"", s);
         g_connectionId = StringSubstr(resp, s, e - s);
      }
      Print("MMXM handshake ok, connId=", g_connectionId);
      if(SynchronizeHistoryOnStart && !g_historySyncDone)
         SynchronizeHistory();
      return true;
   }
   PrintFormat("MMXM handshake failed status=%d body=%s", status, resp);
   return false;
}

//+------------------------------------------------------------------+
//| History sync (runs once at init, blocking with small slices)     |
//+------------------------------------------------------------------+
int InitialBarsFor(const int tfIdx)
{
   switch(tfIdx)
   {
      case IDX_M1:  return InitialM1Bars;
      case IDX_M5:  return InitialM5Bars;
      case IDX_M15: return InitialM15Bars;
      case IDX_H1:  return InitialH1Bars;
      case IDX_H4:  return InitialH4Bars;
      case IDX_D1:  return InitialD1Bars;
   }
   return 1000;
}

void SynchronizeHistory()
{
   for(int t = 0; t < CMmxmCandleSync::TfCount(); t++)
   {
      int want = InitialBarsFor(t);
      if(want <= 0) continue;

      string tf = g_sync.TfName(t);
      datetime from = 0;
      MqlRates rates[];
      int got = g_sync.CopyClosedHistory(t, from, want, rates);
      if(got == 0) { Print("MMXM history: no bars for ", tf); continue; }

      // start
      string batchId = MmxmNewUuid();
      {
         string s[];
         ArrayResize(s, 7);
         s[0]=MmxmJsonStr("terminalId", g_terminalId);
         s[1]=MmxmJsonStr("canonicalSymbol", CanonicalSymbol);
         s[2]=MmxmJsonStr("brokerSymbol", g_brokerSymbol);
         s[3]=MmxmJsonStr("timeframe", tf);
         s[4]=MmxmJsonStr("from", MmxmIsoFromDatetime(rates[0].time));
         s[5]=MmxmJsonStr("to", MmxmIsoFromDatetime(rates[got-1].time));
         s[6]=MmxmJsonInt("expectedBars", got);
         string resp;
         g_http.Post("/mql5/history/start", MmxmJsonObj(s,7), resp);
      }

      // batches (oldest -> newest already)
      int seq = 0;
      for(int off = 0; off < got; off += MaximumBatchSize)
      {
         int take = MathMin(MaximumBatchSize, got - off);
         string items = "";
         for(int i = 0; i < take; i++)
         {
            if(i>0) items += ",";
            items += g_sync.BuildCandleJsonFromRate(g_terminalId, CanonicalSymbol, t, rates[off+i], true, 0);
         }
         string b[];
         ArrayResize(b, 6);
         b[0]=MmxmJsonStr("terminalId", g_terminalId);
         b[1]=MmxmJsonStr("batchId", batchId);
         b[2]=MmxmJsonInt("sequence", seq);
         b[3]=MmxmJsonStr("timeframe", tf);
         b[4]="\"candles\":[" + items + "]";
         b[5]=MmxmJsonBool("isLast", off+take >= got);
         string resp;
         int status = g_http.Post("/mql5/history/batch", MmxmJsonObj(b,6), resp);
         if(status != 200)
            PrintFormat("MMXM history batch failed tf=%s seq=%d status=%d", tf, seq, status);
         seq++;
      }

      // complete
      {
         string c[];
         ArrayResize(c, 4);
         c[0]=MmxmJsonStr("terminalId", g_terminalId);
         c[1]=MmxmJsonStr("batchId", batchId);
         c[2]=MmxmJsonStr("timeframe", tf);
         c[3]=MmxmJsonInt("sentBars", got);
         string resp;
         g_http.Post("/mql5/history/complete", MmxmJsonObj(c,4), resp);
      }
      PrintFormat("MMXM history synced tf=%s bars=%d", tf, got);
   }
   g_historySyncDone = true;
}

//+------------------------------------------------------------------+
//| OnTick — NO HTTP HERE                                            |
//+------------------------------------------------------------------+
void OnTick()
{
   MqlTick tick;
   if(!SymbolInfoTick(g_brokerSymbol, tick)) return;
   g_lastTickAt = TimeGMT();

   if(SendTicks)
   {
      string m[];
      ArrayResize(m, 14);
      string eventId = StringFormat("%s|%s|%I64d|%d", g_terminalId, g_brokerSymbol,
                                    (long)tick.time_msc, (int)(tick.time_msc % 100000));
      m[0]  = MmxmJsonStr("eventId", eventId);
      m[1]  = MmxmJsonStr("terminalId", g_terminalId);
      m[2]  = MmxmJsonStr("accountIdHash", g_accountIdHash);
      m[3]  = MmxmJsonStr("canonicalSymbol", CanonicalSymbol);
      m[4]  = MmxmJsonStr("brokerSymbol", g_brokerSymbol);
      m[5]  = MmxmJsonInt("brokerTimestampMs", tick.time_msc);
      m[6]  = MmxmJsonNum("bid", tick.bid, _Digits);
      m[7]  = MmxmJsonNum("ask", tick.ask, _Digits);
      m[8]  = MmxmJsonNum("last", tick.last, _Digits);
      m[9]  = MmxmJsonInt("volume", (long)tick.volume);
      m[10] = MmxmJsonNum("volumeReal", tick.volume_real, 2);
      m[11] = MmxmJsonInt("flags", (long)tick.flags);
      m[12] = MmxmJsonInt("spreadPoints", (long)((tick.ask - tick.bid) / _Point));
      m[13] = MmxmJsonInt("sequence", (long)(tick.time_msc % 100000));
      g_tickQueue.Push(MmxmJsonObj(m, 14));
   }

   if(SendCurrentCandles)
   {
      // snapshot current candle per TF (throttled: queue replaces older snapshot per tf)
      for(int t = 0; t < CMmxmCandleSync::TfCount(); t++)
      {
         string j = g_sync.BuildCandleJson(g_terminalId, CanonicalSymbol, t, 0, false, 0);
         if(j != "") g_currentCandleQueue.Push(j);
      }
   }

   if(SendClosedCandles)
   {
      int tfIdx[];
      datetime closedAt[];
      int n = g_sync.DetectClosedBars(tfIdx, closedAt);
      for(int i=0;i<n;i++)
      {
         int shift = iBarShift(g_brokerSymbol, g_sync.Tf(tfIdx[i]), closedAt[i], false);
         if(shift < 1) continue; // never treat shift 0 as closed
         string j = g_sync.BuildCandleJson(g_terminalId, CanonicalSymbol, tfIdx[i], shift, true, 0);
         if(j != "") g_closedCandleQueue.Push(j);
      }
   }
}

//+------------------------------------------------------------------+
//| OnTimer — all network here                                       |
//+------------------------------------------------------------------+
void OnTimer()
{
   if(g_http.IsInFlight()) return;

   // retry handshake if no connection id yet
   if(g_connectionId == "")
   {
      if(TimeGMT() >= g_lastSuccessAt + g_backoffSeconds)
      {
         if(SendHandshake()) g_backoffSeconds = 1;
         else g_backoffSeconds = MathMin(g_backoffSeconds * 2, 60);
      }
      return;
   }

   FlushQueue(g_closedCandleQueue, "/mql5/candles/closed", false, g_spoolCandles);
   FlushCurrentCandleSnapshots();
   FlushTickBatch();
   FlushSpool();

   if(TimeGMT() >= g_lastHeartbeatAt + HeartbeatIntervalSeconds)
   {
      SendHeartbeat();
      g_lastHeartbeatAt = TimeGMT();
   }

   ChartStatus(StringFormat("Qtick=%d Qcur=%d Qclosed=%d spoolT=%d spoolC=%d droppedT=%d",
      g_tickQueue.Size(), g_currentCandleQueue.Size(), g_closedCandleQueue.Size(),
      g_spoolTicks.Count(), g_spoolCandles.Count(), g_tickQueue.Dropped()));
}

void FlushQueue(CMmxmQueue &q, const string path, const bool wrapArray, CMmxmSpool &spool)
{
   string item;
   int sent = 0;
   while(sent < MaximumBatchSize && q.Pop(item))
   {
      string body = wrapArray ? "{\"items\":[" + item + "]}" : item;
      string resp;
      int status = g_http.Post(path, body, resp);
      if(status == 200 || status == 409) // 409 dup = fine
      {
         g_lastSuccessAt = TimeGMT();
         sent++;
      }
      else
      {
         // requeue + spool
         q.Push(item);
         if(EnableLocalSpool) spool.Append(item);
         break; // backend likely down — stop hammering
      }
   }
}

void FlushCurrentCandleSnapshots()
{
   // Coalesce: keep only latest snapshot per TF. Cheap approach: drain queue,
   // remember last JSON per TF string key, then send those.
   string latest[];
   ArrayResize(latest, CMmxmCandleSync::TfCount());
   bool has[];
   ArrayResize(has, CMmxmCandleSync::TfCount());
   ArrayInitialize(has, false);

   string item;
   while(g_currentCandleQueue.Pop(item))
   {
      // tf name embedded — find which idx by matching "\"timeframe\":\"XX\""
      for(int t = 0; t < CMmxmCandleSync::TfCount(); t++)
      {
         if(StringFind(item, "\"timeframe\":\"" + g_sync.TfName(t) + "\"") >= 0)
         { latest[t] = item; has[t] = true; break; }
      }
   }
   for(int t = 0; t < CMmxmCandleSync::TfCount(); t++)
   {
      if(!has[t]) continue;
      string resp;
      int status = g_http.Post("/mql5/candles/current", latest[t], resp);
      if(status == 200) g_lastSuccessAt = TimeGMT();
   }
}

void FlushTickBatch()
{
   if(g_tickQueue.Size() == 0) return;
   string items = "";
   int n = 0;
   string item;
   while(n < MaximumBatchSize && g_tickQueue.Pop(item))
   {
      if(n>0) items += ",";
      items += item;
      n++;
   }
   string body = "{\"ticks\":[" + items + "]}";
   string resp;
   int status = g_http.Post("/mql5/ticks/batch", body, resp);
   if(status == 200) { g_lastSuccessAt = TimeGMT(); }
   else
   {
      // push items back? simplest: spool the whole batch body
      if(EnableLocalSpool) g_spoolTicks.Append(body);
   }
}

void FlushSpool()
{
   if(!EnableLocalSpool) return;
   // candles have priority over ticks
   string lines[];
   int cnt = g_spoolCandles.LoadAll(lines);
   if(cnt > 0)
   {
      string remaining[];
      ArrayResize(remaining, 0);
      int flushed = 0;
      for(int i=0;i<cnt && flushed < MaximumBatchSize;i++)
      {
         string resp;
         int status = g_http.Post("/mql5/candles/closed", lines[i], resp);
         if(status == 200 || status == 409) flushed++;
         else
         {
            int rn = ArraySize(remaining);
            ArrayResize(remaining, rn+1);
            remaining[rn] = lines[i];
         }
      }
      // keep unflushed
      for(int i=flushed;i<cnt;i++)
      {
         bool already = false;
         for(int j=0;j<ArraySize(remaining);j++) if(remaining[j]==lines[i]) { already=true; break; }
         if(!already && i >= flushed)
         {
            // add leftovers not attempted
         }
      }
      g_spoolCandles.Rewrite(remaining);
      if(flushed > 0) g_lastSuccessAt = TimeGMT();
   }
   // tick spool: drop aggressively, ticks are low priority
   // (skip resending tick spool when candle spool still has data)
}

void SendHeartbeat()
{
   string m[];
   ArrayResize(m, 11);
   m[0]  = MmxmJsonStr("terminalId", g_terminalId);
   m[1]  = MmxmJsonStr("canonicalSymbol", CanonicalSymbol);
   m[2]  = MmxmJsonStr("brokerSymbol", g_brokerSymbol);
   m[3]  = MmxmJsonBool("terminalConnected", TerminalInfoInteger(TERMINAL_CONNECTED));
   m[4]  = MmxmJsonBool("tradeServerConnected", TerminalInfoInteger(TERMINAL_TRADE_ALLOWED));
   m[5]  = MmxmJsonStr("lastTickTimestamp", g_lastTickAt > 0 ? MmxmIsoFromDatetime(g_lastTickAt) : "");
   m[6]  = MmxmJsonStr("lastSuccessfulRequestTimestamp", g_lastSuccessAt > 0 ? MmxmIsoFromDatetime(g_lastSuccessAt) : "");
   m[7]  = MmxmJsonInt("pendingTickCount", g_tickQueue.Size());
   m[8]  = MmxmJsonInt("pendingCandleCount", g_closedCandleQueue.Size());
   m[9]  = MmxmJsonInt("pendingSpoolCount", g_spoolCandles.Count() + g_spoolTicks.Count());
   m[10] = MmxmJsonInt("terminalMemoryUsedMb", (long)(TerminalInfoInteger(TERMINAL_MEMORY_USED)));
   string body = MmxmJsonObj(m, 11);
   // append serverTimestamp
   body = StringSubstr(body, 0, StringLen(body)-1) + "," +
          MmxmJsonStr("serverTimestamp", MmxmIsoFromDatetime(TimeGMT())) + "}";
   string resp;
   g_http.Post("/mql5/heartbeat", body, resp);
}

//+------------------------------------------------------------------+
//| OnDeinit                                                         |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   // spool everything left
   if(EnableLocalSpool)
   {
      string item;
      while(g_closedCandleQueue.Pop(item)) g_spoolCandles.Append(item);
      // ticks: best effort, drop oldest
      int guard = 0;
      while(g_tickQueue.Pop(item) && guard++ < 1000) g_spoolTicks.Append(item);
   }
   Comment("");
}
