# 📋 Hướng Dẫn Deploy Lần Đầu Tiên

## 🎯 Tổng Quan
Deploy ứng dụng **Exam Preparation** (React + Node.js + PostgreSQL) lên server sử dụng **Docker Compose**.

---

## 📋 Yêu Cầu Tiên Quyết

### Trên Server (Linux/Ubuntu)
```bash
# 1. Cài Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 2. Cài Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 3. Kiểm tra cài đặt
docker --version
docker-compose --version
```

---

## 🚀 Các Bước Deploy

### **Bước 1: Sao Chép Project Lên Server**

Chạy trên **máy local** của bạn (nơi có SSH key):
```bash
# Nếu có Git trên server
ssh user@server_ip "cd /opt && git clone <repo_url> exam-app"

# Hoặc upload zip/rsync
rsync -avz /path/to/project/ user@server_ip:/opt/exam-app/
```

### **Bước 2: SSH Vào Server**

```bash
ssh user@server_ip
cd /opt/exam-app
```

### **Bước 3: Tạo File `.env` Cho Backend**

```bash
# Từ file example
cp backend/.env.example backend/.env

# Chỉnh sửa biến môi trường (nếu cần thay đổi)
nano backend/.env
```

Nội dung `backend/.env` (có thể giữ mặc định hoặc thay đổi):
```env
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=exam_preparation
PORT=5000
```

**⚠️ Chú ý:**
- Đổi `DB_PASSWORD` thành mật khẩu mạnh trên production.
- Nếu máy local đã cấu hình `.env` khác, hãy sao chép nội dung nó sang server.

### **Bước 4: Build Docker Images**

```bash
# Xây dựng tất cả images (lần đầu sẽ mất ~5-10 phút)
docker-compose build

# Hoặc build riêng từng service
docker-compose build backend
docker-compose build frontend
```

**✅ Thành công nếu không có lỗi.**

### **Bước 5: Khởi Chạy Containers**

```bash
# Chạy ở background
docker-compose up -d

# Hoặc chạy ở foreground để xem logs real-time (Ctrl+C để dừng)
docker-compose up
```

### **Bước 6: Kiểm Tra Trạng Thái**

```bash
# Xem danh sách containers
docker-compose ps

# Kết quả mong muốn:
# NAME                STATUS           PORTS
# exam-prep-db        Up (healthy)     0.0.0.0:5432->5432
# exam-prep-backend   Up               0.0.0.0:5000->5000
# exam-prep-frontend  Up               0.0.0.0:80->80
```

### **Bước 7: Kiểm Tra Health Check**

```bash
# Test backend API
curl http://localhost:5000/health

# Kết quả mong muốn:
# {"status":"Backend running"}

# Test frontend (mở trong trình duyệt hoặc curl)
curl http://localhost

# Hoặc từ máy local:
curl http://<server_ip>
```

---

## 🛠️ Các Lệnh Hữu Ích

### **Xem Logs**
```bash
# Logs backend
docker-compose logs backend --tail=100 -f

# Logs database
docker-compose logs postgres --tail=50

# Logs frontend
docker-compose logs frontend --tail=50

# Logs tất cả services
docker-compose logs -f
```

### **Dừng Services**
```bash
# Dừng tất cả containers (giữ data)
docker-compose stop

# Dừng và xóa containers (giữ images)
docker-compose down

# Dừng và xóa tất cả (xóa data, images)
docker-compose down -v
```

### **Khởi Động Lại**
```bash
# Restart một service
docker-compose restart backend

# Restart tất cả
docker-compose restart
```

---

## 🔄 Rollback (Quay Lại Phiên Bản Cũ)

Nếu deployment thất bại hoặc có lỗi:

### **Cách 1: Dừng Containers Hiện Tại**
```bash
# Dừng tất cả services
docker-compose down

# Xóa images để rebuild lại từ đầu nếu cần
docker-compose rm -f
```

### **Cách 2: Quay Lại Commit Git Trước Đó**
```bash
# Xem commit history
git log --oneline

# Quay lại commit cũ
git checkout <commit_id>

# Rebuild và chạy lại
docker-compose build
docker-compose up -d
```

### **Cách 3: Backup Toàn Bộ PostgreSQL**
```bash
# Backup database
docker-compose exec postgres pg_dump -U postgres exam_preparation > backup.sql

# Restore từ backup
docker-compose exec -T postgres psql -U postgres exam_preparation < backup.sql
```

---

## ⚠️ Troubleshooting

### **Lỗi: Port 5000 đã được sử dụng**
```bash
# Tìm process chiếm port
lsof -i :5000

# Kill process (thay PID bằng số thực tế)
kill -9 <PID>

# Hoặc thay đổi port trong docker-compose.yml
# ports: 
#   - "8000:5000"  # map sang port 8000
```

### **Lỗi: Cannot connect to Docker daemon**
```bash
# Kiểm tra Docker service
sudo systemctl status docker

# Khởi động Docker nếu chưa chạy
sudo systemctl start docker

# Thêm user vào docker group (không cần sudo)
sudo usermod -aG docker $USER
newgrp docker
```

### **Frontend không load đúng**
```bash
# Xem logs frontend
docker-compose logs frontend

# Kiểm tra nginx config
docker-compose exec frontend cat /etc/nginx/conf.d/default.conf

# Restart frontend
docker-compose restart frontend
```

### **Backend không kết nối Database**
```bash
# Kiểm tra logs backend
docker-compose logs backend

# Kiểm tra database đã sẵn sàng
docker-compose exec postgres pg_isready -U postgres

# Restart backend
docker-compose restart backend
```

---

## 🔒 Bảo Mật (Production)

### **Thay Đổi Database Password**
```bash
# Cập nhật trong docker-compose.yml
# environment:
#   POSTGRES_PASSWORD: <your_strong_password>

# Và backend/.env
# DB_PASSWORD=<your_strong_password>

docker-compose down
docker-compose up -d
```

### **Giới Hạn Port Công Khai**
```bash
# Chỉ cho phép backend port từ localhost (sử dụng Nginx reverse proxy)
# ports:
#   - "127.0.0.1:5000:5000"  # chỉ localhost
```

### **Sử Dụng SSL/TLS (HTTPS)**
```bash
# Cài Let's Encrypt Certbot
sudo apt-get install certbot python3-certbot-nginx

# Tạo certificate
sudo certbot certonly --standalone -d yourdomain.com

# Cập nhật Nginx config với certificate path
```

---

## 📝 Maintenance

### **Cập Nhật Code (sau git pull)**
```bash
# Pull code mới
git pull origin main

# Rebuild images (nếu có thay đổi dependencies)
docker-compose build

# Restart containers
docker-compose down
docker-compose up -d
```

### **Dọn Dẹp Docker**
```bash
# Xóa unused images
docker image prune -a

# Xóa unused volumes
docker volume prune

# Xóa unused networks
docker network prune
```

### **Cron Job Backup Daily**
```bash
# Thêm vào crontab (crontab -e)
0 2 * * * cd /opt/exam-app && docker-compose exec -T postgres pg_dump -U postgres exam_preparation > backups/backup_$(date +\%Y\%m\%d).sql
```

---

## ✅ Checklist Deploy

- [ ] Docker & Docker Compose đã cài
- [ ] Project đã clone/upload lên server
- [ ] File `.env` đã tạo và cấu hình
- [ ] `docker-compose build` thành công
- [ ] `docker-compose up -d` chạy không lỗi
- [ ] `docker-compose ps` shows 3 containers UP
- [ ] `curl http://localhost:5000/health` trả về status 200
- [ ] Frontend load được tại `http://<server_ip>`
- [ ] Database health check pass

---

## 📞 Support

Nếu gặp lỗi:
1. Xem logs: `docker-compose logs -f`
2. Kiểm tra `.env` file
3. Restart containers: `docker-compose restart`
4. Nếu vẫn lỗi, rollback theo hướng dẫn **Rollback** ở trên.

**Chúc mừng! 🎉 Deploy thành công!**
