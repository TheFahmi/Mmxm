//+------------------------------------------------------------------+
//| MmxmSignature.mqh — HMAC-SHA256 signing for ingestion API        |
//+------------------------------------------------------------------+
#ifndef MMXM_SIGNATURE_MQH
#define MMXM_SIGNATURE_MQH

// SHA-256 (FIPS 180-4) compact implementation for MQL5.
class CSha256
{
private:
   uint   m_h[8];
   ulong  m_len;
   uchar  m_buf[64];
   int    m_bufLen;

   static uint rotr(uint x, int n) { return (x >> n) | (x << (32 - n)); }

   void transform(const uchar &block[])
   {
      static const uint k[64] = {
         0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
         0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
         0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
         0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
         0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
         0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
         0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
         0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2 };
      uint w[64];
      for(int i=0;i<16;i++)
         w[i] = ((uint)block[i*4]<<24)|((uint)block[i*4+1]<<16)|((uint)block[i*4+2]<<8)|(uint)block[i*4+3];
      for(int i=16;i<64;i++)
      {
         uint s0 = rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>3);
         uint s1 = rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>10);
         w[i] = w[i-16]+s0+w[i-7]+s1;
      }
      uint a=m_h[0],b=m_h[1],c=m_h[2],d=m_h[3],e=m_h[4],f=m_h[5],g=m_h[6],h=m_h[7];
      for(int i=0;i<64;i++)
      {
         uint S1=rotr(e,6)^rotr(e,11)^rotr(e,25);
         uint ch=(e&f)^((~e)&g);
         uint t1=h+S1+ch+k[i]+w[i];
         uint S0=rotr(a,2)^rotr(a,13)^rotr(a,22);
         uint maj=(a&b)^(a&c)^(b&c);
         uint t2=S0+maj;
         h=g;g=f;f=e;e=d+t1;d=c;c=b;b=a;a=t1+t2;
      }
      m_h[0]+=a;m_h[1]+=b;m_h[2]+=c;m_h[3]+=d;m_h[4]+=e;m_h[5]+=f;m_h[6]+=g;m_h[7]+=h;
   }

public:
   CSha256() { Reset(); }
   void Reset()
   {
      m_h[0]=0x6a09e667;m_h[1]=0xbb67ae85;m_h[2]=0x3c6ef372;m_h[3]=0xa54ff53a;
      m_h[4]=0x510e527f;m_h[5]=0x9b05688c;m_h[6]=0x1f83d9ab;m_h[7]=0x5be0cd19;
      m_len=0; m_bufLen=0;
   }
   void Update(const uchar &data[], int len)
   {
      m_len += (ulong)len;
      int off=0;
      while(len>0)
      {
         int take = MathMin(64 - m_bufLen, len);
         ArrayCopy(m_buf, data, m_bufLen, off, take);
         m_bufLen += take; off += take; len -= take;
         if(m_bufLen==64) { transform(m_buf); m_bufLen=0; }
      }
   }
   void Final(uchar &out[]) // out[32]
   {
      ulong bitLen = m_len * 8;
      uchar pad = 0x80;
      uchar padArr[1]; padArr[0]=pad;
      Update(padArr,1);
      uchar zero[1]; zero[0]=0;
      while(m_bufLen != 56) Update(zero,1);
      uchar lenBuf[8];
      for(int i=0;i<8;i++) lenBuf[i]=(uchar)((bitLen>>(56-8*i))&0xFF);
      Update(lenBuf,8);
      ArrayResize(out,32);
      for(int i=0;i<8;i++)
      {
         out[i*4]  =(uchar)((m_h[i]>>24)&0xFF);
         out[i*4+1]=(uchar)((m_h[i]>>16)&0xFF);
         out[i*4+2]=(uchar)((m_h[i]>>8)&0xFF);
         out[i*4+3]=(uchar)(m_h[i]&0xFF);
      }
   }
};

void MmxmStringToBytes(const string s, uchar &out[])
{
   int n = StringToCharArray(s, out, 0, WHOLE_ARRAY, CP_UTF8);
   if(n>0) ArrayResize(out, n-1); // strip null terminator
   else ArrayResize(out,0);
}

string MmxmBytesToHex(const uchar &data[])
{
   string hex = "";
   for(int i=0;i<ArraySize(data);i++)
      hex += StringFormat("%02x", data[i]);
   return hex;
}

// HMAC-SHA256(key, message) -> lowercase hex string
string MmxmHmacSha256Hex(const string key, const string message)
{
   uchar keyBytes[];
   MmxmStringToBytes(key, keyBytes);
   uchar blockKey[64];
   ArrayInitialize(blockKey, 0);
   if(ArraySize(keyBytes) > 64)
   {
      CSha256 h; h.Update(keyBytes, ArraySize(keyBytes));
      uchar digest[]; h.Final(digest);
      ArrayCopy(blockKey, digest, 0, 0, 32);
   }
   else
      ArrayCopy(blockKey, keyBytes, 0, 0, ArraySize(keyBytes));

   uchar ipad[64], opad[64];
   for(int i=0;i<64;i++) { ipad[i]=(uchar)(blockKey[i]^0x36); opad[i]=(uchar)(blockKey[i]^0x5c); }

   uchar msg[];
   MmxmStringToBytes(message, msg);

   CSha256 inner;
   inner.Update(ipad,64);
   inner.Update(msg, ArraySize(msg));
   uchar innerDigest[];
   inner.Final(innerDigest);

   CSha256 outer;
   outer.Update(opad,64);
   outer.Update(innerDigest, ArraySize(innerDigest));
   uchar outDigest[];
   outer.Final(outDigest);

   return MmxmBytesToHex(outDigest);
}

// Build canonical string and sign: timestamp + "." + nonce + "." + rawBody
string MmxmSignRequest(const string secret, const string timestamp, const string nonce, const string rawBody)
{
   return MmxmHmacSha256Hex(secret, timestamp + "." + nonce + "." + rawBody);
}

// Simple uuid v4 from random
string MmxmNewUuid()
{
   MathSrand((uint)(GetMicrosecondCount() ^ GetTickCount()));
   string s = "";
   for(int i=0;i<32;i++)
   {
      int r = MathRand() % 16;
      s += StringFormat("%x", r);
      if(i==7||i==11||i==15||i==19) s += "-";
   }
   // set version 4 + variant
   StringSetCharacter(s, 12, '4');
   int v = 8 + MathRand()%4; // 8,9,a,b
   string vs = StringFormat("%x", v);
   s = StringSubstr(s, 0, 16) + vs + StringSubstr(s, 17);
   return s;
}

// Random nonce hex
string MmxmNewNonce()
{
   string s = "";
   for(int i=0;i<16;i++)
      s += StringFormat("%02x", MathRand()%256);
   return s;
}

#endif
