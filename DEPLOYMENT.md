# Deploy mien phi bang Render + Supabase

Huong dan nay danh cho lan deploy dau tien, khong can VPS va khong can domain rieng.

Ban se dung:
- GitHub: luu source code
- Supabase Free: PostgreSQL database
- Render Free: backend Node.js va frontend React static site

Ket qua sau deploy:
- Backend co URL dang `https://ten-backend.onrender.com`
- Frontend co URL dang `https://ten-frontend.onrender.com`
- Nguoi dung truy cap frontend URL de dung app

Luu y quan trong:
- Render Free Web Service co the sleep khi khong co traffic, lan truy cap dau co the cham.
- Upload file/anh dang luu tren filesystem cua backend. Tren free hosting, file upload co the khong ben vung sau deploy/restart. Database van nam tren Supabase.
- Supabase Free co gioi han dung luong. Phu hop de hoc, demo, test voi so nguoi dung nho.

## 1. Dua code len GitHub

1. Vao https://github.com
2. Tao repository moi, vi du `exam-preparation-app`
3. Day code len repository do

Neu chua dung Git bao gio, mo terminal tai thu muc project va chay:

```bash
git init
git add .
git commit -m "Initial deploy version"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

## 2. Tao database tren Supabase

1. Vao https://supabase.com
2. Dang nhap hoac dang ky
3. Bam `New project`
4. Chon organization cua ban
5. Dien:
   - Project name: `exam-preparation`
   - Database password: tao mat khau manh va luu lai
   - Region: chon gan nguoi dung cua ban
6. Bam `Create new project`
7. Doi Supabase tao project xong

Lay connection string:

1. Trong Supabase project, vao `Project Settings`
2. Vao `Database`
3. Tim phan `Connection string`
4. Chon kieu `URI`
5. Copy chuoi PostgreSQL
6. Neu chuoi co `[YOUR-PASSWORD]`, thay bang database password ban da tao

Vi du:

```text
postgresql://postgres.xxxxx:YOUR_PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres
```

## 3. Deploy backend len Render

1. Vao https://render.com
2. Dang nhap bang GitHub
3. Bam `New`
4. Chon `Web Service`
5. Chon repository GitHub cua project
6. Cau hinh:
   - Name: `exam-prep-backend`
   - Root Directory: `backend`
   - Runtime: `Node`
   - Build Command: `npm ci`
   - Start Command: `npm start`
   - Instance Type: `Free`

7. Trong phan `Environment Variables`, them:

```env
NODE_ENV=production
DATABASE_URL=<connection_string_supabase>
DB_SSL=true
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

Neu ban co Gemini API key thi dien vao `GEMINI_API_KEY`; neu khong co thi de trong.

8. Bam `Create Web Service`
9. Doi Render build va start xong

Kiem tra backend:

1. Mo URL backend Render, vi du:

```text
https://exam-prep-backend.onrender.com/health
```

2. Neu thay:

```json
{"status":"Backend running"}
```

la backend da chay.

Backend se tu dong tao bang database khi khoi dong.

## 4. Deploy frontend len Render

1. Vao Render Dashboard
2. Bam `New`
3. Chon `Static Site`
4. Chon cung repository GitHub
5. Cau hinh:
   - Name: `exam-prep-frontend`
   - Root Directory: `frontend`
   - Build Command: `npm ci && npm run build`
   - Publish Directory: `build`

6. Trong `Environment Variables`, them:

```env
REACT_APP_API_URL=https://exam-prep-backend.onrender.com/api
```

Thay `https://exam-prep-backend.onrender.com` bang URL backend Render that cua ban.

7. Bam `Create Static Site`
8. Doi Render build xong

Sau khi xong, Render se cho URL frontend, vi du:

```text
https://exam-prep-frontend.onrender.com
```

Day la link gui cho nguoi dung.

## 5. Kiem tra app sau deploy

Mo frontend URL:

```text
https://exam-prep-frontend.onrender.com
```

Kiem tra:
- Dang ky tai khoan moi
- Dang nhap
- Upload file de thi
- Luu dap an
- Lam bai thi
- Xem lich su thi
- Xoa lich su thi

Neu loi upload hoac loi database:

1. Vao Render Dashboard
2. Mo service `exam-prep-backend`
3. Vao tab `Logs`
4. Doc loi moi nhat

## 6. Cap nhat code sau nay

Moi lan ban sua code:

```bash
git add .
git commit -m "Update app"
git push
```

Render se tu dong build lai backend/frontend neu Auto Deploy dang bat.

Neu Render khong tu build:

1. Vao Render Dashboard
2. Chon service
3. Bam `Manual Deploy`
4. Chon `Deploy latest commit`

## 7. Loi thuong gap

### Frontend bao loi khong ket noi server

Kiem tra bien moi truong frontend:

```env
REACT_APP_API_URL=https://exam-prep-backend.onrender.com/api
```

Sau khi sua bien moi truong, bam `Manual Deploy` frontend lai.

### Backend loi database

Kiem tra bien:

```env
DATABASE_URL=<connection_string_supabase>
DB_SSL=true
```

Dam bao da thay `[YOUR-PASSWORD]` bang password that cua Supabase database.

### Lan dau truy cap cham

Day la han che cua Render Free. Service co the sleep khi khong co traffic.

### File upload mat sau khi deploy/restart

Day la han che cua free hosting khi luu file tren filesystem. De production nghiem tuc, nen chuyen file upload sang Supabase Storage, S3, Cloudinary, hoac dich vu storage tuong tu.

## 8. Checklist

- [ ] Code da len GitHub
- [ ] Supabase project da tao
- [ ] Da copy `DATABASE_URL`
- [ ] Backend Render da chay
- [ ] `https://backend-url/health` tra ve OK
- [ ] Frontend Render da build xong
- [ ] Frontend co `REACT_APP_API_URL=https://backend-url/api`
- [ ] Dang ky/dang nhap duoc
- [ ] Upload de thi duoc
- [ ] Lam bai va xem lich su duoc
