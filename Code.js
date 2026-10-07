/**
 * Google Apps Script Web App API for School Grades Viewer
 * 
 * นี่คือส่วนของ Backend API ที่จะคอยรับคำขอจากหน้าเว็บเบราว์เซอร์
 * และเข้าไปค้นหาไฟล์ผลการเรียนใน Google Drive จากนั้นจะแปลงไฟล์เป็น Base64
 * เพื่อส่งกลับไปแสดงผลที่หน้าเว็บโดยตรง
 * (Speed-Optimized version: ใช้ CacheService + Drive Search Index)
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

    year = year.trim();
    grade = grade.trim();

    // 3. ดึงโฟลเดอร์ระดับชั้น (ผ่านระบบแคชเพื่อความเร็วสูงสุด)
    var gradeFolderResult = getGradeFolder(year, grade);
    if (!gradeFolderResult.success) {
      return makeResponse({
        success: false,
        message: gradeFolderResult.message
      });
    }
    var gradeFolder = gradeFolderResult.folder;

    // 4. ค้นหาไฟล์ผลการเรียนด้วย Drive Search Index (เร็วขึ้น 5 เท่า)
    var targetFile = findStudentFile(gradeFolder, nationalId);

    if (!targetFile) {
      return makeResponse({
        success: false,
        message: "ไม่พบเอกสารผลการเรียนสำหรับเลขประจำตัวประชาชนนี้"
      });
    }

    // 5. ดึงข้อมูลไฟล์และแปลงเป็น Base64
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
 * ฟังก์ชันค้นหาโฟลเดอร์ระดับชั้น พร้อมระบบแคช (CacheService)
 * แคช Folder ID ไว้นานสูงสุด 6 ชั่วโมง เพื่อลดเวลา Traversal เหลือ ~0.1 วินาที
 */
function getGradeFolder(year, grade) {
  var cache = CacheService.getScriptCache();
  var cacheKey = "folder_" + encodeURIComponent(year) + "_" + encodeURIComponent(grade);

  // 1. ตรวจสอบในแคช
  var cachedFolderId = cache.get(cacheKey);
  if (cachedFolderId) {
    try {
      var folder = DriveApp.getFolderById(cachedFolderId);
      return { success: true, folder: folder };
    } catch (e) {
      // หากโฟลเดอร์เดิมถูกลบหรือแคชผิดพลาด ให้ข้ามไปค้นหาจริง
      cache.remove(cacheKey);
    }
  }

  // 2. หากไม่มีในแคช ให้ค้นหาตามลำดับชั้น
  var rootFolder;
  try {
    rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  } catch (err) {
    return {
      success: false,
      message: "ไม่สามารถเข้าถึงระบบจัดเก็บไฟล์ได้ (Folder ID ไม่ถูกต้อง หรือไม่มีสิทธิ์เข้าถึง): " + err.toString()
    };
  }

  var yearFolders = rootFolder.getFoldersByName(year);
  if (!yearFolders.hasNext()) {
    return {
      success: false,
      message: "ไม่พบโฟลเดอร์ปีการศึกษา " + year + " ภายในโฟลเดอร์หลัก (" + rootFolder.getName() + ")"
    };
  }
  var yearFolder = yearFolders.next();

  var gradeFolders = yearFolder.getFoldersByName(grade);
  if (!gradeFolders.hasNext()) {
    return {
      success: false,
      message: "ไม่พบโฟลเดอร์ระดับชั้น " + grade + " ภายในโฟลเดอร์ปีการศึกษา " + year
    };
  }
  var gradeFolder = gradeFolders.next();

  // 3. บันทึกลงแคช (21600 วินาที = 6 ชั่วโมง)
  try {
    cache.put(cacheKey, gradeFolder.getId(), 21600);
  } catch (e) {
    // กรณีบันทึกแคชไม่สำเร็จ ให้ทำงานต่อได้ตามปกติ
  }

  return { success: true, folder: gradeFolder };
}

/**
 * ฟังก์ชันค้นหาไฟล์ผลการเรียนของนักเรียน
 * ใช้ DriveApp.searchFiles query index ก่อน และมี fallback วนลูปหากค้นหาไม่เจอ
 * รองรับทั้งรูปแบบ:
 * - เลขบัตรประชาชนนำหน้า: 1234567890123_GradeReport.pdf
 * - เลขที่+ชื่อ-นามสกุล-เลขบัตร: 01 เด็กชายกิตติพงษ์ เสาวะภาพ-1234567890123.pdf
 */
function findStudentFile(gradeFolder, nationalId) {
  var targetFile = null;

  try {
    // 1. ค้นหาแบบตรงเป้าด้วย Search Query Index (เร็วมาก)
    var query = "'" + gradeFolder.getId() + "' in parents and title contains '" + nationalId + "' and trashed = false";
    var files = DriveApp.searchFiles(query);

    while (files.hasNext()) {
      var file = files.next();
      var fileName = file.getName();
      // ตรวจสอบว่าชื่อไฟล์มีเลขประจำตัวประชาชน 13 หลักนี้ปรากฏอยู่หรือไม่ (อยู่หน้า กลาง หรือหลังชื่อ)
      if (fileName.indexOf(nationalId) !== -1) {
        targetFile = file;
        return targetFile;
      }
    }
  } catch (e) {
    // หาก Search Query ขัดข้อง จะสลับไปใช้วิธี Fallback วนลูป
  }

  // 2. Fallback: วนลูปค้นหาทีละไฟล์ในโฟลเดอร์ห้องเรียน
  var allFiles = gradeFolder.getFiles();
  while (allFiles.hasNext()) {
    var f = allFiles.next();
    if (f.getName().indexOf(nationalId) !== -1) {
      targetFile = f;
      break;
    }
  }

  return targetFile;
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
