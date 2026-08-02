//+------------------------------------------------------------------+
//| MmxmCandleSync.mqh — candle snapshot + closed detection + sync   |
//+------------------------------------------------------------------+
#ifndef MMXM_CANDLE_SYNC_MQH
#define MMXM_CANDLE_SYNC_MQH

#include "MmxmJsonBuilder.mqh"

#define MMXM_TF_COUNT 6

enum ENUM_MMXM_TF_IDX { IDX_M1=0, IDX_M5=1, IDX_M15=2, IDX_H1=3, IDX_H4=4, IDX_D1=5 };

class CMmxmCandleSync
{
private:
   string          m_brokerSymbol;
   ENUM_TIMEFRAMES m_tfs[MMXM_TF_COUNT];
   string          m_tfNames[MMXM_TF_COUNT];
   datetime        m_lastBarTime[MMXM_TF_COUNT];   // open time of current candle we track
   int             m_revision[MMXM_TF_COUNT];
   bool            m_initialized;

public:
   void Init(const string brokerSymbol)
   {
      m_brokerSymbol = brokerSymbol;
      m_tfs[0]=PERIOD_M1;  m_tfNames[0]="M1";
      m_tfs[1]=PERIOD_M5;  m_tfNames[1]="M5";
      m_tfs[2]=PERIOD_M15; m_tfNames[2]="M15";
      m_tfs[3]=PERIOD_H1;  m_tfNames[3]="H1";
      m_tfs[4]=PERIOD_H4;  m_tfNames[4]="H4";
      m_tfs[5]=PERIOD_D1;  m_tfNames[5]="D1";
      for(int i=0;i<MMXM_TF_COUNT;i++)
      {
         m_lastBarTime[i] = iTime(m_brokerSymbol, m_tfs[i], 0);
         m_revision[i] = 0;
      }
      m_initialized = true;
   }

   string TfName(const int idx) const { return m_tfNames[idx]; }
   ENUM_TIMEFRAMES Tf(const int idx) const { return m_tfs[idx]; }
   static int TfCount() { return MMXM_TF_COUNT; }

   // Reset baseline so we don't emit "closed" events for stale bars at startup
   void ResetBaseline()
   {
      for(int i=0;i<MMXM_TF_COUNT;i++)
         m_lastBarTime[i] = iTime(m_brokerSymbol, m_tfs[i], 0);
   }

   // Detect bars that closed since last call. Fills tfIdx[] + closedOpenTime[].
   // Returns count. Caller builds + sends closed payloads.
   int DetectClosedBars(int &tfIdx[], datetime &closedOpenTime[])
   {
      ArrayResize(tfIdx, 0);
      ArrayResize(closedOpenTime, 0);
      if(!m_initialized) return 0;
      for(int i=0;i<MMXM_TF_COUNT;i++)
      {
         datetime cur = iTime(m_brokerSymbol, m_tfs[i], 0);
         if(cur == 0) continue;
         if(cur > m_lastBarTime[i])
         {
            // bar at shift=1 just closed (possibly more if EA was busy; walk them)
            int shift = iBarShift(m_brokerSymbol, m_tfs[i], m_lastBarTime[i], false);
            for(int s = shift; s >= 1; s--)
            {
               datetime ot = iTime(m_brokerSymbol, m_tfs[i], s);
               if(ot <= 0) continue;
               int n = ArraySize(tfIdx);
               ArrayResize(tfIdx, n+1);
               ArrayResize(closedOpenTime, n+1);
               tfIdx[n] = i;
               closedOpenTime[n] = ot;
            }
            m_lastBarTime[i] = cur;
            m_revision[i] = 0;
         }
      }
      return ArraySize(tfIdx);
   }

   // Build candle JSON for given tf + shift (0 = current)
   string BuildCandleJson(const string terminalId, const string canonicalSymbol,
                          const int tfIdx, const int shift, const bool isClosed,
                          const int revision)
   {
      MqlRates r[];
      if(CopyRates(m_brokerSymbol, m_tfs[tfIdx], shift, 1, r) != 1)
         return "";
      return BuildCandleJsonFromRate(terminalId, canonicalSymbol, tfIdx, r[0], isClosed, revision);
   }

   string BuildCandleJsonFromRate(const string terminalId, const string canonicalSymbol,
                                  const int tfIdx, const MqlRates &r, const bool isClosed,
                                  const int revision)
   {
      string tf = m_tfNames[tfIdx];
      string openIso = MmxmIsoFromDatetime(r.time);
      datetime ct = r.time + (datetime)(PeriodSeconds(m_tfs[tfIdx])) - 1;
      string closeIso = MmxmIsoFromDatetime(ct);
      string eventId = StringFormat("%s|%s|%s|%s|%d", terminalId, m_brokerSymbol, tf, openIso, revision);

      string m[];
      ArrayResize(m, 16);
      m[0]  = MmxmJsonStr("eventId", eventId);
      m[1]  = MmxmJsonStr("terminalId", terminalId);
      m[2]  = MmxmJsonStr("canonicalSymbol", canonicalSymbol);
      m[3]  = MmxmJsonStr("brokerSymbol", m_brokerSymbol);
      m[4]  = MmxmJsonStr("timeframe", tf);
      m[5]  = MmxmJsonStr("openTime", openIso);
      m[6]  = MmxmJsonStr("closeTime", closeIso);
      m[7]  = MmxmJsonNum("open", r.open, _Digits);
      m[8]  = MmxmJsonNum("high", r.high, _Digits);
      m[9]  = MmxmJsonNum("low", r.low, _Digits);
      m[10] = MmxmJsonNum("close", r.close, _Digits);
      m[11] = MmxmJsonInt("tickVolume", r.tick_volume);
      m[12] = MmxmJsonInt("realVolume", (long)r.real_volume);
      m[13] = MmxmJsonInt("spread", r.spread);
      m[14] = MmxmJsonBool("isClosed", isClosed);
      m[15] = MmxmJsonInt("revision", revision);
      string extra = MmxmJsonStr("source", "MQL5");
      return StringSubstr(MmxmJsonObj(m, 16), 0, 0) + "{" +
         StringSubstr(MmxmJsonObj(m,16), 1, StringLen(MmxmJsonObj(m,16))-2) +
         "," + extra + "}";
   }

   // Copy history oldest->newest starting after 'fromTime' (exclusive), max 'bars'.
   // Uses shift-based reads so live bar (shift 0) can be excluded.
   int CopyClosedHistory(const int tfIdx, const datetime fromTime, const int maxBars,
                         MqlRates &out[])
   {
      ArrayResize(out, 0);
      int startShift = iBarShift(m_brokerSymbol, m_tfs[tfIdx], fromTime, false);
      if(startShift < 0) startShift = Bars(m_brokerSymbol, m_tfs[tfIdx]) - 1;
      // walk from oldest (higher shift) down to shift 1 (last closed)
      int copied = 0;
      MqlRates tmp[];
      for(int s = startShift; s >= 1 && copied < maxBars; s--)
      {
         if(CopyRates(m_brokerSymbol, m_tfs[tfIdx], s, 1, tmp) != 1) continue;
         int n = ArraySize(out);
         ArrayResize(out, n+1);
         out[n] = tmp[0];
         copied++;
      }
      return copied;
   }
};

#endif
