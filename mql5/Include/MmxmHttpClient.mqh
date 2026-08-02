//+------------------------------------------------------------------+
//| MmxmHttpClient.mqh — signed HTTPS POST client                    |
//+------------------------------------------------------------------+
#ifndef MMXM_HTTP_CLIENT_MQH
#define MMXM_HTTP_CLIENT_MQH

#include "MmxmSignature.mqh"
#include "MmxmJsonBuilder.mqh"

class CMmxmHttpClient
{
private:
   string m_baseUrl;
   string m_apiKey;
   string m_apiSecret;
   string m_terminalId;
   int    m_timeoutMs;
   bool   m_requestInFlight;
   int    m_retryCount[];
   long   m_nextRetryAtMs[];

public:
   void Init(const string baseUrl, const string apiKey, const string apiSecret,
             const string terminalId, const int timeoutMs)
   {
      m_baseUrl = baseUrl;
      StringReplace(m_baseUrl, "http://", "https://"); // force https in prod; harmless if already https
      // Note: localhost dev may legitimately use http — revert by editing here.
      if(StringSubstr(m_baseUrl,0,7) != "http://" && StringSubstr(m_baseUrl,0,8) != "https://")
         m_baseUrl = "https://" + m_baseUrl;
      m_apiKey = apiKey;
      m_apiSecret = apiSecret;
      m_terminalId = terminalId;
      m_timeoutMs = timeoutMs;
      m_requestInFlight = false;
   }

   bool IsInFlight() const { return m_requestInFlight; }

   // Synchronous POST. Returns HTTP status, or -1 on transport error.
   // NOTE: WebRequest blocks the EA thread up to timeout. Called ONLY from
   // OnTimer, never from OnTick, and only one request at a time.
   int Post(const string path, const string jsonBody, string &responseOut)
   {
      if(m_apiKey == "" || m_apiSecret == "")
      {
         responseOut = "{\"success\":false,\"error\":{\"code\":\"NO_CREDENTIALS\"}}";
         return -1;
      }

      string url = m_baseUrl + path;
      string timestamp = IntegerToString((long)TimeGMT());
      string nonce = MmxmNewNonce();
      string signature = MmxmSignRequest(m_apiSecret, timestamp, nonce, jsonBody);

      string headers =
         "Content-Type: application/json\r\n" +
         "X-MMXM-API-KEY: " + m_apiKey + "\r\n" +
         "X-MMXM-TIMESTAMP: " + timestamp + "\r\n" +
         "X-MMXM-NONCE: " + nonce + "\r\n" +
         "X-MMXM-SIGNATURE: " + signature + "\r\n" +
         "X-MMXM-TERMINAL-ID: " + m_terminalId + "\r\n";

      uchar body[];
      MmxmStringToBytes(jsonBody, body);
      uchar result[];
      string resultHeaders;

      m_requestInFlight = true;
      ResetLastError();
      int status = WebRequest("POST", url, headers, m_timeoutMs, body, result, resultHeaders);
      m_requestInFlight = false;

      if(status == -1)
      {
         int err = GetLastError();
         // 4060 = URL not allowed. 4014 = function not allowed (AutoTrading off).
         PrintFormat("MMXM WebRequest failed err=%d url=%s (check allowed URLs in Tools>Options>Expert Advisors)", err, url);
         responseOut = "";
         return -1;
      }
      responseOut = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      return status;
   }

   int Get(const string path, string &responseOut)
   {
      string url = m_baseUrl + path;
      string timestamp = IntegerToString((long)TimeGMT());
      string nonce = MmxmNewNonce();
      string signature = MmxmSignRequest(m_apiSecret, timestamp, nonce, "");
      string headers =
         "X-MMXM-API-KEY: " + m_apiKey + "\r\n" +
         "X-MMXM-TIMESTAMP: " + timestamp + "\r\n" +
         "X-MMXM-NONCE: " + nonce + "\r\n" +
         "X-MMXM-SIGNATURE: " + signature + "\r\n" +
         "X-MMXM-TERMINAL-ID: " + m_terminalId + "\r\n";
      uchar emptyBody[];
      ArrayResize(emptyBody, 0);
      uchar result[];
      string resultHeaders;
      m_requestInFlight = true;
      int status = WebRequest("GET", url, headers, m_timeoutMs, emptyBody, result, resultHeaders);
      m_requestInFlight = false;
      if(status == -1) { responseOut=""; return -1; }
      responseOut = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      return status;
   }
};

#endif
