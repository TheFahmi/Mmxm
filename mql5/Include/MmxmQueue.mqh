//+------------------------------------------------------------------+
//| MmxmQueue.mqh — in-memory queues + file spool                    |
//+------------------------------------------------------------------+
#ifndef MMXM_QUEUE_MQH
#define MMXM_QUEUE_MQH

// Generic JSON-string queue. Stores serialized payloads (already-built JSON)
// so queue never depends on payload schema.
class CMmxmQueue
{
private:
   string m_items[];
   int    m_head;      // index of first live item
   int    m_maxSize;   // 0 = unlimited
   int    m_dropped;   // count dropped due to overflow (oldest first)
   string m_name;

public:
   void Init(const string name, const int maxSize)
   {
      m_name = name;
      m_maxSize = maxSize;
      m_head = 0;
      m_dropped = 0;
      ArrayResize(m_items, 0);
   }

   int Size() const { return ArraySize(m_items) - m_head; }
   int Dropped() const { return m_dropped; }

   void Push(const string item)
   {
      if(m_maxSize > 0 && Size() >= m_maxSize)
      {
         // drop oldest
         m_head++;
         m_dropped++;
         CompactIfNeeded();
      }
      int n = ArraySize(m_items);
      ArrayResize(m_items, n+1);
      m_items[n] = item;
   }

   bool Peek(string &item) const
   {
      if(Size() <= 0) return false;
      item = m_items[m_head];
      return true;
   }

   bool Pop(string &item)
   {
      if(Size() <= 0) return false;
      item = m_items[m_head];
      m_head++;
      CompactIfNeeded();
      return true;
   }

   void Clear() { ArrayResize(m_items,0); m_head=0; }

private:
   void CompactIfNeeded()
   {
      if(m_head > 1024 && m_head > ArraySize(m_items)/2)
      {
         int live = Size();
         for(int i=0;i<live;i++) m_items[i] = m_items[m_head+i];
         ArrayResize(m_items, live);
         m_head = 0;
      }
   }
};

// File spool: append JSON lines to MQL5/Files/<name>.spool
class CMmxmSpool
{
private:
   string m_fileName;

public:
   void Init(const string terminalId, const string kind)
   {
      m_fileName = StringFormat("mmxm_%s_%s.spool", terminalId, kind);
   }

   void Append(const string jsonLine)
   {
      int h = FileOpen(m_fileName, FILE_WRITE|FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON);
      if(h == INVALID_HANDLE) return;
      FileSeek(h, 0, SEEK_END);
      FileWriteString(h, jsonLine + "\n");
      FileClose(h);
   }

   // Load all pending lines and delete file (caller owns retry semantics)
   int LoadAll(string &out[])
   {
      ArrayResize(out, 0);
      int h = FileOpen(m_fileName, FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON);
      if(h == INVALID_HANDLE) return 0;
      while(!FileIsEnding(h))
      {
         string line = FileReadString(h);
         if(StringLen(line) > 0)
         {
            int n = ArraySize(out);
            ArrayResize(out, n+1);
            out[n] = line;
         }
      }
      FileClose(h);
      return ArraySize(out);
   }

   // Rewrite file with only the given lines (after partial flush)
   void Rewrite(const string &lines[])
   {
      FileDelete(m_fileName, FILE_COMMON);
      if(ArraySize(lines) == 0) return;
      int h = FileOpen(m_fileName, FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON);
      if(h == INVALID_HANDLE) return;
      for(int i=0;i<ArraySize(lines);i++)
         FileWriteString(h, lines[i] + "\n");
      FileClose(h);
   }

   int Count()
   {
      int h = FileOpen(m_fileName, FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON);
      if(h == INVALID_HANDLE) return 0;
      int c = 0;
      while(!FileIsEnding(h)) { FileReadString(h); c++; }
      FileClose(h);
      return c;
   }
};

#endif
