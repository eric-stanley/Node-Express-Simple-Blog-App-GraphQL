const fs = require('fs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');
const { promisify } = require('util')
const unlinkAsync = promisify(fs.unlink);

dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const imageStore = {
    uploadToCloud(req, res, next) {
    
    if(!req.file ) {
        return next();
    }
    
    const { path } = req.file;
    cloudinary.uploader.upload(path, {
        tags: '',
        width: 150,
        height: 150,
        folder: process.env.CLOUDINARY_IMAGE_FOLDER_NAME,
        allowed_formats: ['jpg', 'jpeg', 'png']
    })
    .then((image) => {
        req.image = image;
    })
    .then((result) => {
        return unlinkAsync(req.file.path);
    })
    .then(result => {
        return next();
    })
    .catch(err => {
        if(!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    });
    }
};

const removeFromCloud = (public_id) => {
    cloudinary.uploader.destroy(public_id)
    .then((result) => {
        console.log('Image deleted from cloud')
    })
    .catch(err => {
        console.log('Error while deleting image from cloud');
        if(!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    });
}

const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'images');
    },
    filename: (req, file, cb) => {
      cb(null, new Date().toISOString() + '-' + file.originalname);
    }
});

const fileFilter = (req, file, cb) => {
    if(file.mimetype === 'image/png' || file.mimetype === 'image/jpg' || file.mimetype === 'image/jpeg') {
        cb(null, true);
    } else {
        cb(null, false);
    }
}

const upload = multer({ storage: fileStorage,  limits: { fileSize: 1024 * 1024 * 5 }, fileFilter });

module.exports = {
    upload: upload,
    imageStore: imageStore,
    removeFromCloud: removeFromCloud
}
