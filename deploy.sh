#!/bin/bash
# Script สำหรับ Push โค้ดและทำการ Re-deploy อัตโนมัติในคำสั่งเดียว

DEPLOYMENT_ID="AKfycbz6E1EXOcdMC-NRbOGCDzq6lTgZepoR4RpwvaYh04jbKBqo0Dx5CyYiC7e7rP-8OlpLAQ"

echo "🚀 กำลังอัปโหลดโค้ดไปยัง Google Apps Script (clasp push)..."
clasp push -f

if [ $? -eq 0 ]; then
  echo "✅ อัปโหลดโค้ดเสร็จสมบูรณ์!"
  echo "🔄 กำลังอัปเดตเวอร์ชันการเผยแพร่เว็บแอป (clasp deploy)..."
  clasp deploy -i "$DEPLOYMENT_ID" -d "Auto-deployed at $(date '+%Y-%m-%d %H:%M:%S')"
  
  if [ $? -eq 0 ]; then
    echo "🎉 อัปเดตและเผยแพร่เรียบร้อยแล้ว! เปิดหน้าเว็บและกด Refresh เพื่อดูผลลัพธ์ได้ทันที"
  else
    echo "❌ เกิดข้อผิดพลาดในขั้นตอนการเผยแพร่เว็บแอป (clasp deploy)"
  fi
else
  echo "❌ เกิดข้อผิดพลาดในขั้นตอนการอัปโหลดโค้ด (clasp push)"
fi
