//+------------------------------------------------------------------+
//| ExportXauusdHistory.mq5 — dump XAUUSD history to CSV/JSONL       |
//| Run as a script on any XAUUSD chart. Output in MQL5/Files.       |
//+------------------------------------------------------------------+
#property copyright "MMXM"
#property version   "1.00"
#property script_show_inputs

input string InpSymbol      = "";        // empty = chart symbol
input int    InpBarsM1      = 20000;
input int    InpBarsM5      = 10000;
input int    InpBarsM15     = 5000;
input int    InpBarsH1      = 3000;
input int    InpBarsH4      = 1500;
input int    InpBarsD1      = 1000;
input bool   InpWriteCsv    = true;
input bool   InpWriteJsonl  = true;

string TfName(ENUM_TIMEFRAMES tf)
{
   switch(tf)
   {
      case PERIOD_M1: return "M1";
      case PERIOD_M5: return "M5";
      case PERIOD_M15: return "M15";
      case PERIOD_H1: return "H1";
      case PERIOD_H4: return "H4";
      case PERIOD_D1: return "D1";
   }
   return "UNK";
}

void ExportTf(const string sym, ENUM_TIMEFRAMES tf, const int bars)
{
   if(bars <= 0) return;
   string tfName = TfName(tf);
   MqlRates r[];
   int got = CopyRates(sym, tf, 1, bars, r); // shift 1..N, excludes live bar
   if(got <= 0) { Print("Export ", tfName, ": no data"); return; }
   ArraySetAsSeries(r, false); // oldest first

   if(InpWriteCsv)
   {
      string fn = StringFormat("XAUUSD_%s.csv", tfName);
      int h = FileOpen(fn, FILE_WRITE|FILE_CSV|FILE_ANSI, ',');
      if(h != INVALID_HANDLE)
      {
         FileWrite(h, "open_time","open","high","low","close","tick_volume","real_volume","spread");
         for(int i=0;i<got;i++)
            FileWrite(h,
               TimeToString(r[i].time, TIME_DATE|TIME_SECONDS),
               DoubleToString(r[i].open, _Digits),
               DoubleToString(r[i].high, _Digits),
               DoubleToString(r[i].low, _Digits),
               DoubleToString(r[i].close, _Digits),
               r[i].tick_volume,
               DoubleToString(r[i].real_volume, 0),
               r[i].spread);
         FileClose(h);
         Print("Exported ", fn, " bars=", got);
      }
   }

   if(InpWriteJsonl)
   {
      string fn = StringFormat("XAUUSD_%s.jsonl", tfName);
      int h = FileOpen(fn, FILE_WRITE|FILE_TXT|FILE_ANSI);
      if(h != INVALID_HANDLE)
      {
         for(int i=0;i<got;i++)
         {
            MqlDateTime m; TimeToStruct(r[i].time, m);
            string iso = StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
               m.year, m.mon, m.day, m.hour, m.min, m.sec);
            string line = StringFormat(
               "{\"openTime\":\"%s\",\"open\":%s,\"high\":%s,\"low\":%s,\"close\":%s,\"tickVolume\":%I64d,\"realVolume\":%I64d,\"spread\":%d}",
               iso,
               DoubleToString(r[i].open, _Digits),
               DoubleToString(r[i].high, _Digits),
               DoubleToString(r[i].low, _Digits),
               DoubleToString(r[i].close, _Digits),
               r[i].tick_volume, (long)r[i].real_volume, r[i].spread);
            FileWriteString(h, line + "\n");
         }
         FileClose(h);
         Print("Exported ", fn, " bars=", got);
      }
   }
}

void OnStart()
{
   string sym = (InpSymbol == "" ? _Symbol : InpSymbol);
   if(!SymbolSelect(sym, true)) { Print("Symbol not available: ", sym); return; }
   ExportTf(sym, PERIOD_M1,  InpBarsM1);
   ExportTf(sym, PERIOD_M5,  InpBarsM5);
   ExportTf(sym, PERIOD_M15, InpBarsM15);
   ExportTf(sym, PERIOD_H1,  InpBarsH1);
   ExportTf(sym, PERIOD_H4,  InpBarsH4);
   ExportTf(sym, PERIOD_D1,  InpBarsD1);
   Print("Export complete. Files in MQL5/Files.");
}
