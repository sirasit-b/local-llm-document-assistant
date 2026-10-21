# Local LLM – Document Assistant

ระบบผู้ช่วย AI สำหรับถาม-ตอบจากเอกสารภายในองค์กร รองรับการสลับ AI Engine ระหว่าง
**Local AI** (Ollama / vLLM / OpenAI-compatible server) และ **OpenAI API**
โดยไม่ต้องแก้โค้ดหรือ build image ใหม่

> ระบบเริ่มต้นที่ Empty State เสมอ ไม่มีข้อมูลตัวอย่าง เอกสารจำลอง สถานะปลอม
> หรือคำตอบที่สร้างขึ้นเอง ทุกอย่างที่แสดงมาจากฐานข้อมูล, Backend API, AI Provider
> หรือ OCR Engine จริงเท่านั้น

## สถาปัตยกรรม

```
Frontend (Next.js)
        │
Backend API (FastAPI)
        │
Application Services
   ├── DocumentService      อัปโหลด จัดเก็บ และ pipeline การประมวลผล
   ├── RAGService           retrieval → prompt → answer → citations
   ├── SearchService        vector search บน pgvector
   ├── EmbeddingService     แยกจาก LLM โดยสมบูรณ์
   ├── OCRService           เรียก OCR microservice ที่เปลี่ยนตัวได้
   ├── LLMService           ตรวจสอบ provider/model ฝั่งเซิร์ฟเวอร์
   └── SystemService        health check จริงของทุกบริการ
        │
Provider abstraction  (app/providers)
   LLMProvider        ├── OllamaProvider
                      └── OpenAICompatibleProvider (OpenAI / vLLM / local server)
   EmbeddingProvider  ├── OllamaEmbeddingProvider
                      └── OpenAICompatibleEmbeddingProvider
   OCRProvider        └── HttpOcrProvider
```

Business logic ไม่เรียก OpenAI หรือ Ollama โดยตรง — ทุกการเรียกผ่าน interface
ใน `backend/app/providers/base.py` การเพิ่ม Azure OpenAI หรือ AWS Bedrock ในอนาคต
ทำได้โดยเพิ่ม adapter ใหม่หนึ่งไฟล์และลงทะเบียนใน `registry.py`

## เริ่มใช้งาน

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API docs (เฉพาะ non-production): http://localhost:8000/api/docs

### Profile: cloud development (ค่าเริ่มต้น)

บริการหลักทั้งหมด (frontend, backend, postgres+pgvector, document-worker, ocr)
ทำงานโดยไม่ต้องมี GPU และเรียก OpenAI API จากภายนอก

```bash
docker compose up --build
```

ตั้งค่า `OPENAI_API_KEY` ใน `.env` หรือกรอกที่ **ตั้งค่าระบบ → AI Engines**

### Profile: local-ai

เพิ่ม Ollama เข้ามาในสแตกสำหรับเครื่อง on-premise

```bash
docker compose --profile local-ai up --build
docker compose exec ollama ollama pull qwen2.5:7b-instruct
docker compose exec ollama ollama pull nomic-embed-text
```

จากนั้นที่ **ตั้งค่าระบบ → AI Engines** เลือก Default Model และ
Default Embedding Model จากรายการที่ดึงมาจากเซิร์ฟเวอร์จริง

> OpenAI เป็นบริการภายนอก จึงไม่มี container ใน compose — backend เป็นฝ่ายเรียกออกไปเอง

## ขั้นตอนการใช้งานหลัก

```
อัปโหลด → ประมวลผล → เลือก AI Engine → ถาม → ได้คำตอบ → ตรวจสอบแหล่งอ้างอิง
```

Pipeline การประมวลผลเอกสาร (ทำงานใน `document-worker`):

```
Upload → Validation → Text Extraction → OCR (ถ้าจำเป็น) → Cleaning
      → Chunking → Embedding → Vector Indexing → Ready
```

ทุกสถานะถูกเขียนลงฐานข้อมูลจริง เอกสารจะไม่ถูกทำเครื่องหมายว่า Ready
จนกว่าทุกขั้นตอนจะสำเร็จ

## ความเป็นส่วนตัว

| โหมด | ข้อความที่ผู้ใช้เห็น |
| --- | --- |
| Local AI | การประมวลผล AI ทำงานผ่านระบบภายในที่กำหนด |
| OpenAI API | ข้อมูลที่เกี่ยวข้องกับคำถามอาจถูกส่งไปยังบริการภายนอกเพื่อประมวลผล |

- การส่งคำถามไปยัง engine ภายนอกต้องได้รับการยืนยันจากผู้ใช้ก่อนเสมอ และ
  **backend ตรวจสอบซ้ำ** ผ่าน flag `acknowledge_external`
- `LOCAL_ONLY_MODE=true` ปิด OpenAI ทั้งระบบ: ซ่อนจาก `/api/providers`
  และปฏิเสธคำขอที่ชั้น service ไม่ใช่แค่ซ่อน UI
- ระบบจะไม่สลับไปใช้ provider ภายนอกเองเมื่อ Local AI ใช้ไม่ได้

## ความปลอดภัย

- API Key ถูกเก็บที่ backend (env หรือ `app_settings`) และไม่เคยถูกส่งกลับมาที่ frontend
  — response คืนเฉพาะค่า mask (`••••••••••••••••`) และ logger กรองค่าที่คล้ายความลับออก
- ไฟล์ที่อัปโหลดไม่ถูกเปิดเป็น public path ต้องผ่าน `/api/documents/{id}/file`
- ตรวจสอบนามสกุล/ขนาดไฟล์ และ sanitize ชื่อไฟล์ก่อนบันทึก
- client ส่งได้เพียงชื่อ provider และ model — URL และ credential ถูก resolve ฝั่ง server
  และ model ถูกตรวจสอบกับรายการจริงของ provider
- error ที่ส่งกลับผู้ใช้ไม่มี stack trace มีเพียงข้อความอ่านเข้าใจได้และรหัส incident
- โครงสร้างพร้อมต่อยอด auth/authz: ทุก route รับ `Principal` ผ่าน dependency เดียว
  (`app/core/security.py`) ซึ่งเปลี่ยนเป็น OIDC/JWT ได้โดยไม่แตะ route

## API

| Endpoint | หน้าที่ |
| --- | --- |
| `GET /api/health` | liveness |
| `GET /api/system/status` | สถานะจริงของ backend, database, vector db, llm, embedding, ocr |
| `GET/POST /api/documents`, `/upload`, `/{id}`, `/{id}/preview`, `/{id}/file`, `/{id}/reprocess` | จัดการเอกสาร |
| `POST /api/chat`, `POST /api/chat/stream` | ถาม-ตอบ (stream เป็น SSE) |
| `POST /api/search` | semantic search อย่างเดียว |
| `GET /api/ocr`, `/api/ocr/health`, `POST /api/ocr/{id}/rerun` | งาน OCR |
| `GET /api/providers`, `/{provider}/models`, `/{provider}/health` | AI engines |
| `GET/PUT /api/settings` | ตั้งค่าโดยผู้ดูแลระบบ |
| `GET/POST/DELETE /api/sources`, `POST /api/sources/{id}/test` | แหล่งข้อมูลภายใน |

## การพัฒนาแบบไม่ใช้ Docker

```bash
# backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
python worker.py        # อีกเทอร์มินัลหนึ่ง

# frontend
cd frontend
npm install
npm run dev
```

ต้องมี PostgreSQL ที่ติดตั้งส่วนขยาย `vector` และตั้ง `DATABASE_URL` ให้ถูกต้อง

## หมายเหตุด้านเทคนิค

- คอลัมน์ embedding ประกาศเป็น `vector` แบบไม่ระบุมิติ เพราะเลือก embedding model
  ได้ตอน runtime การค้นหาจึงเป็น exact scan ที่จำกัดเฉพาะ chunk ที่ใช้โมเดลเดียวกัน
  หากตรึงมิติในงาน production แล้ว ให้เพิ่ม HNSW/ivfflat index
- การเปลี่ยน Embedding Model ต้องสั่ง Reprocess เอกสารเดิม มิฉะนั้นเอกสารเหล่านั้น
  จะไม่ถูกค้นเจอ (ระบบไม่เทียบเวกเตอร์ข้ามโมเดล)
- OCR microservice ใช้ Tesseract (tha+eng) และเปลี่ยนตัวได้ด้วยการชี้ `OCR_BASE_URL`
  ไปยังบริการอื่นที่ทำ contract `GET /health` + `POST /ocr` เหมือนกัน
- PDF ภาษาไทยที่ฝัง subset CID font มัก extract ออกมาเป็นอักขระเพี้ยน
  (เช่น `แฟ้Iมสั่นี้กวั1าง`) ระบบตรวจจับกรณีนี้ใน `is_garbled_thai()` แล้วส่งไป OCR
  เหมือนไฟล์สแกน แทนที่จะปล่อยข้อความที่ใช้ค้นหาไม่ได้เข้าสู่ดัชนี
- `min_relevance_score` ค่าเริ่มต้น 0.18 ค่อนข้างผ่อนปรน โมเดล embedding บางตัว
  (เช่น nomic-embed-text) ให้คะแนน cosine ที่กระจุกตัว จึงควรปรับค่านี้ตามโมเดลที่ใช้จริง
  — prompt ของ RAG จะปฏิเสธการเดาอยู่แล้ว แต่การตั้งค่าที่เหมาะสมช่วยลด context ที่ไม่เกี่ยวข้อง
