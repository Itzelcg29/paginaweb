const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_PATH || './uploads';
const profileImagesDir = path.join(uploadDir, 'profile-images');
const documentsDir = path.join(uploadDir, 'documents');
const courseMaterialsDir = path.join(uploadDir, 'course-materials');

// Create directories if they don't exist
[uploadDir, profileImagesDir, documentsDir, courseMaterialsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure storage for profile images
const profileImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, profileImagesDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `profile-${req.params.id || uniqueSuffix}-${uniqueSuffix}${ext}`);
  }
});

// Configure storage for documents
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, documentsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  }
});

// Configure storage for course materials
const courseMaterialStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, courseMaterialsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `material-${uniqueSuffix}${ext}`);
  }
});

// File filter for images
const imageFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// File filter for documents
const documentFilter = (req, file, cb) => {
  const allowedTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only document files are allowed!'), false);
  }
};

// File filter for course materials (images, documents, videos)
const courseMaterialFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf|mp4|avi|mov|wmv|mp3|wav/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('File type not allowed!'), false);
  }
};

// Create multer instances
const uploadProfileImage = multer({
  storage: profileImageStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

const uploadDocument = multer({
  storage: documentStorage,
  fileFilter: documentFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

const uploadCourseMaterial = multer({
  storage: courseMaterialStorage,
  fileFilter: courseMaterialFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

// Generic upload with custom configuration
const createUpload = (storage, fileFilter, limits) => {
  return multer({
    storage,
    fileFilter,
    limits
  });
};

// Error handling middleware for multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'File size exceeds the limit'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files',
        message: 'Number of files exceeds the limit'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: 'Unexpected file field',
        message: 'Unexpected file field in request'
      });
    }
  }

  if (error.message.includes('Only')) {
    return res.status(400).json({
      error: 'Invalid file type',
      message: error.message
    });
  }

  console.error('Upload error:', error);
  return res.status(500).json({
    error: 'Upload failed',
    message: 'Unable to upload file'
  });
};

// File deletion utility
const deleteFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

// Get file info
const getFileInfo = (file) => {
  return {
    originalName: file.originalname,
    filename: file.filename,
    path: file.path,
    size: file.size,
    mimetype: file.mimetype,
    url: `/uploads/${path.relative(uploadDir, file.path)}`
  };
};

// Validate file size
const validateFileSize = (file, maxSize) => {
  return file.size <= maxSize;
};

// Get file extension
const getFileExtension = (filename) => {
  return path.extname(filename).toLowerCase();
};

// Check if file is image
const isImage = (filename) => {
  const ext = getFileExtension(filename);
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
};

// Check if file is document
const isDocument = (filename) => {
  const ext = getFileExtension(filename);
  return ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf'].includes(ext);
};

// Check if file is video
const isVideo = (filename) => {
  const ext = getFileExtension(filename);
  return ['.mp4', '.avi', '.mov', '.wmv'].includes(ext);
};

// Check if file is audio
const isAudio = (filename) => {
  const ext = getFileExtension(filename);
  return ['.mp3', '.wav'].includes(ext);
};

module.exports = {
  upload: uploadProfileImage,
  uploadProfileImage: uploadProfileImage.single('profileImage'),
  uploadDocument: uploadDocument.single('document'),
  uploadCourseMaterial: uploadCourseMaterial.single('material'),
  uploadMultipleDocuments: uploadDocument.array('documents', 10),
  uploadMultipleCourseMaterials: uploadCourseMaterial.array('materials', 20),
  handleUploadError,
  deleteFile,
  getFileInfo,
  validateFileSize,
  getFileExtension,
  isImage,
  isDocument,
  isVideo,
  isAudio,
  createUpload,
  uploadDir,
  profileImagesDir,
  documentsDir,
  courseMaterialsDir
}; 