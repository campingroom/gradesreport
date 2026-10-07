/**
 * Google Apps Script Web App API for School Grades Viewer
 * 
 * นี่คือส่วนของ Backend API ที่จะคอยรับคำขอจากหน้าเว็บเบราว์เซอร์
 * และเข้าไปค้นหาไฟล์ผลการเรียนใน Google Drive จากนั้นจะแปลงไฟล์เป็น Base64
 * เพื่อส่งกลับไปแสดงผลที่หน้าเว็บโดยตรง
 */

// โฟลเดอร์หลักสำหรับเก็บข้อมูลผลการเรียน (โปรดแทนที่ด้วย Folder ID จริงของคุณ)
var ROOT_FOLDER_ID = "18pAusFNuCxoPzopLn9p3vTcSdueNaq_I";

/**
 * ฟังก์ชันหลักที่ทำหน้าที่รับ HTTP GET Request
 * @param {Object} e พารามิเตอร์ที่ส่งมาจากหน้าเว็บ (year, grade, id)
 */
function doGet(e) {
  try {
    // 1. รับค่าพารามิเตอร์จาก URL
    var year = e.parameter.year;
    var grade = e.parameter.grade;
    var nationalId = e.parameter.id;

    // 2. ตรวจสอบข้อมูลนำเข้าเบื้องต้น
    if (!year || !grade || !nationalId) {
      return makeResponse({
        success: false,
        message: "กรุณาระบุข้อมูลให้ครบถ้วน (ปีการศึกษา, ระดับชั้น, และเลขประจำตัวประชาชน)"
      });
    }

    // ล้างช่องว่างของรหัสประจำตัวประชาชน และเช็คว่ามี 13 หลักหรือไม่
    nationalId = nationalId.trim();
    if (!/^\d{13}$/.test(nationalId)) {
      return makeResponse({
        success: false,
        message: "เลขประจำตัวประชาชนต้องเป็นตัวเลข 13 หลักเท่านั้น"
      });
    }

    // 3. เข้าถึงโฟลเดอร์หลัก (Root Folder)
    var rootFolder;
    try {
      rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    } catch (err) {
      return makeResponse({
        success: false,
        message: "ไม่สามารถเข้าถึงระบบจัดเก็บไฟล์ได้ (Folder ID ไม่ถูกต้อง หรือไม่มีสิทธิ์เข้าถึง): " + err.toString()
      });
    }

    // 4. ค้นหาโฟลเดอร์ปีการศึกษา
    var yearFolders = rootFolder.getFoldersByName(year.trim());
    if (!yearFolders.hasNext()) {
      return makeResponse({
        success: false,
        message: "ไม่พบโฟลเดอร์ปีการศึกษา " + year + " ภายในโฟลเดอร์หลัก (" + rootFolder.getName() + ")"
      });
    }
    var yearFolder = yearFolders.next();

    // 5. ค้นหาโฟลเดอร์ระดับชั้น
    var gradeFolders = yearFolder.getFoldersByName(grade.trim());
    if (!gradeFolders.hasNext()) {
      return makeResponse({
        success: false,
        message: "ไม่พบโฟลเดอร์ระดับชั้น " + grade + " ภายในโฟลเดอร์ปีการศึกษา " + year
      });
    }
    var gradeFolder = gradeFolders.next();

    // 6. ค้นหาไฟล์ผลการเรียนที่ชื่อขึ้นต้นด้วยเลขบัตรประชาชน
    var files = gradeFolder.getFiles();
    var targetFile = null;
    while (files.hasNext()) {
      var file = files.next();
      var fileName = file.getName();
      // เช็คว่าชื่อไฟล์เริ่มต้นด้วยเลขบัตรประชาชนหรือไม่
      if (fileName.indexOf(nationalId) === 0) {
        targetFile = file;
        break; // หยุดหาเมื่อเจอไฟล์แรกที่ตรงกัน
      }
    }

    if (!targetFile) {
      return makeResponse({
        success: false,
        message: "ไม่พบเอกสารผลการเรียนสำหรับเลขประจำตัวประชาชนนี้"
      });
    }

    // 7. ดึงข้อมูลไฟล์และแปลงเป็น Base64
    var blob = targetFile.getBlob();
    var bytes = blob.getBytes();
    var base64Data = Utilities.base64Encode(bytes);
    var mimeType = targetFile.getMimeType();

    // ส่งผลลัพธ์กลับไปยังเบราว์เซอร์
    return makeResponse({
      success: true,
      name: targetFile.getName(),
      mimeType: mimeType,
      base64: base64Data,
      viewUrl: targetFile.getUrl() // ตัวเลือกเพิ่มเติมสำหรับการลิงก์โดยตรง
    });

  } catch (error) {
    return makeResponse({
      success: false,
      message: "เกิดข้อผิดพลาดในการประมวลผลระบบ: " + error.toString()
    });
  }
}

/**
 * ฟังก์ชันสร้าง JSON Output สำหรับส่งกลับไปที่เบราว์เซอร์พร้อมรองรับ CORS
 * @param {Object} dataObj ออบเจ็กต์ข้อมูลที่ต้องการแปลงเป็น JSON
 */
function makeResponse(dataObj) {
  var JSONString = JSON.stringify(dataObj);
  return ContentService.createTextOutput(JSONString)
    .setMimeType(ContentService.MimeType.JSON);
}
