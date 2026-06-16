# Exam Preparation Application - Setup Guide

## Quick Start

This is a complete exam preparation system with OCR, parsing, and interactive testing.

### Prerequisites
- Node.js v16+
- Docker & Docker Compose
- PostgreSQL (or Docker)

### Installation (5 minutes)

```bash
# 1. Start database
docker-compose up -d

# 2. Setup backend
cd backend
npm install
npm run migrate
npm run dev

# 3. Setup frontend (new terminal)
cd frontend
npm install
npm start
```

Visit `http://localhost:3000` to start using the app!

### Environment Setup

Backend `.env`:
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=exam_preparation
PORT=5000
NODE_ENV=development
```

## File Upload Format

```
Câu 1: Question text?
A. Option 1
B. Option 2
C. Option 3
D. Option 4
Đáp án: B
```

## Architecture

- **Backend:** Node.js + Express (Port 5000)
- **Frontend:** ReactJS (Port 3000)
- **Database:** PostgreSQL
- **OCR:** Tesseract.js
- **Image Processing:** Sharp

## Key Endpoints

- `POST /api/exams/create` - Upload and parse exam
- `GET /api/exams/{id}` - Get exam questions
- `POST /api/exams/submit` - Submit answers and grade

## Troubleshooting

**Database won't start:**
```bash
docker-compose down -v
docker-compose up -d
npm run migrate
```

**Port in use:**
```bash
# Change PORT in .env or kill process on port
```

See README.md for full documentation.
