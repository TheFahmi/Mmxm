//+------------------------------------------------------------------+
//| MmxmJsonBuilder.mqh — JSON serialization helpers                 |
//+------------------------------------------------------------------+
#ifndef MMXM_JSON_BUILDER_MQH
#define MMXM_JSON_BUILDER_MQH

string MmxmJsonEscape(const string s)
{
   string r = s;
   StringReplace(r, "\\", "\\\\");
   StringReplace(r, "\"", "\\\"");
   StringReplace(r, "\n", "\\n");
   StringReplace(r, "\r", "\\r");
   StringReplace(r, "\t", "\\t");
   return r;
}

string MmxmJsonStr(const string key, const string val)
{
   return StringFormat("\"%s\":\"%s\"", key, MmxmJsonEscape(val));
}

// Shortest-round-trip float: DoubleToString emits trailing zeros (e.g. 2914.32000000)
// which differ from JSON.stringify's normalized form -> HMAC mismatch. Trim them.
string MmxmTrimNum(const string s)
{
   string r = s;
   int dot = StringFind(r, ".");
   if(dot >= 0)
   {
      // strip trailing zeros
      while(StringLen(r) > dot + 1 && StringGetCharacter(r, StringLen(r)-1) == '0')
         r = StringSubstr(r, 0, StringLen(r)-1);
      // strip trailing dot if all zeros
      if(StringGetCharacter(r, StringLen(r)-1) == '.')
         r = StringSubstr(r, 0, StringLen(r)-1);
   }
   return r;
}

string MmxmJsonNum(const string key, const double val, const int digits = -1)
{
   if(digits >= 0)
      return StringFormat("\"%s\":%s", key, MmxmTrimNum(DoubleToString(val, digits)));
   return StringFormat("\"%s\":%s", key, MmxmTrimNum(DoubleToString(val, 8)));
}

string MmxmJsonInt(const string key, const long val)
{
   return StringFormat("\"%s\":%I64d", key, val);
}

string MmxmJsonBool(const string key, const bool val)
{
   return StringFormat("\"%s\":%s", key, val ? "true" : "false");
}

string MmxmJsonNull(const string key)
{
   return StringFormat("\"%s\":null", key);
}

string MmxmIsoFromDatetime(const datetime dt)
{
   MqlDateTime m;
   TimeToStruct(dt, m);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
      m.year, m.mon, m.day, m.hour, m.min, m.sec);
}

// Join object members with commas and wrap in braces
string MmxmJsonObj(const string &members[], const int count)
{
   string r = "{";
   for(int i=0;i<count;i++)
   {
      if(i>0) r += ",";
      r += members[i];
   }
   r += "}";
   return r;
}

#endif
