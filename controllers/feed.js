const validator = require('express-validator');

const fileHelper = require('../util/file');
const io = require('../socket');

const Post = require('../models/post');
const User = require('../models/user');
const user = require('../models/user');

exports.getPosts = (req, res, next) => {
    const currentPage = req.query.page || 1;
    const perPage = 2;
    let totalItems;
    Post
        .find()
        .countDocuments()
        .then(count => {
            totalItems = count;
            return Post
                .find()
                .populate('creator')
                .sort({
                    createdAt: -1
                })
                .skip((currentPage - 1) * perPage)
                .limit(perPage);
        })
        .then(posts => {
            res
                .status(200)
                .json({
                    message: 'Fetched posts successfully',
                    posts: posts,
                    totalItems: totalItems
                })
        })
        .catch(err => {
            if(!err.statusCode) {
                err.statusCode = 500;
            }
            next(err);
        });
}

exports.createPost = (req, res, next) => {
    const errors = validator.validationResult(req);

    if(!errors.isEmpty()) {
        const error = new Error('Validation failed. Entered data is incorrect');
        error.statusCode = 422;
        throw error;
    }

    if(!req.file) {
        const error = new Error('No image provided');
        error.statusCode = 422;
        throw error;
    }

    const imageUrl = req.image.url;
    const title = req.body.title;
    const content = req.body.content;
    const imageAssetId = req.image.asset_id;
    const imagePublicId = req.image.public_id;
    let creator;
    
    const post = new Post({
        title: title, 
        content: content,
        imageUrl: imageUrl,
        imageAssetId: imageAssetId,
        imagePublicId: imagePublicId,
        creator: req.userId
    });
    post
        .save()
        .then(result => {
            return User
                .findById(req.userId);
        })
        .then(user => {
            creator = user;
            user
                .posts
                .push(post);
            return user
                .save();
        })
        .then((result) => {
            return io.getIO().emit('posts', {
                action: 'create',
                post: { 
                    ...post._doc, 
                    creator: {
                        _id: req.userId,
                        name: user.name
                    }
                }
            });
        })
        .then(result => {
            res
                .status(201)
                .json({
                    message: 'Post created successfully!',
                    post: post,
                    creator: {
                        id: creator._id,
                        name: creator.name
                    }
                })
        })
        .catch(err => {
            if(!err.statusCode) {
                err.statusCode = 500;
            }
            next(err);
        });
}

exports.getPost = (req, res, next) => {
    const postId = req.params.postId;
    Post
        .findById({
            _id: postId
        })
        .then(post => {
            if(!post) {
                const err = new Error('Could not find post!');
                err.statusCode = 404;
                throw err;
            }
            res
                .status(200)
                .json({
                    message: 'Post fetched successfully',
                    post: post
                })
        })
        .catch(err => {
            if(!err.statusCode) {
                err.statusCode = 500;
            }
            next(err);
        })
}

exports.updatePost = (req, res, next) => {

    const errors = validator.validationResult(req);

    if(!errors.isEmpty()) {
        const error = new Error('Validation failed. Entered data is incorrect');
        error.statusCode = 422;
        throw error;
    }

    const postId = req.params.postId;
    const title = req.body.title;
    const content = req.body.content;
    let imageUrl = req.body.image;
    let imageAssetId;
    let imagePublicId;

    if(req.file) {
        imageUrl = req.image.url;
        imageAssetId = req.image.asset_id;
        imagePublicId = req.image.public_id;
    }

    if(!imageUrl) {
        const error = new Error('No file picked');
        error.statusCode = 422;
        throw error;
    }

    Post
        .findById({
            _id: postId
        })
        .populate('creator')
        .then(post => {
            if(!post) {
                const err = new Error('Could not find post!');
                err.statusCode = 404;
                throw err;
            }
            
            if(post.creator._id.toString() !== req.userId) {
                const error = new Error('Not authorized');
                error.statusCode = 403;
                throw error;
            }

            if(imageUrl !== post.imageUrl) {
                deleteImage(post.imagePublicId)
            }

            post.title = title;
            post.imageUrl = imageUrl;
            post.content = content;
            if(req.file) {
                post.imageAssetId = imageAssetId;
                post.imagePublicId = imagePublicId;
            }
            return post.save();
        })
        .then(result => {
            io.getIO().emit('posts', {
                action: 'update',
                post: result
            })
            return res
                .status(200)
                .json({
                    message: 'Post updated!',
                    post: result
                })
        })
        .catch(err => {
            if(!err.statusCode) {
                err.statusCode = 500;
            }
            next(err);
        })
}

exports.deletePost = (req, res, next) => {
    const postId = req.params.postId;

    Post
        .findById({
            _id: postId
        })
        .then(post => {
            if(!post) {
                const err = new Error('Could not find post!');
                err.statusCode = 404;
                throw err;
            }

            if(post.creator.toString() !== req.userId) {
                const error = new Error('Not authorized');
                error.statusCode = 403;
                throw error;
            }

            deleteImage(post.imagePublicId);
            return Post.findByIdAndRemove(postId, {
                useFindAndModify: false
            });
        })
        .then(result => {
             return User
                .findById(req.userId);
        })
        .then(user => {
            user.posts.pull(postId);
            return user.save();
        })
        .then(result => {
            io.getIO().emit('posts', {
                action: 'delete',
                post: postId
            })
            return res.status(200).json({
                message: 'Post deleted!'
            });
        })
        .catch(err => {
            if(!err.statusCode) {
                err.statusCode = 500;
            }
            next(err);
        });
}

const deleteImage = (imagePublicId) => {
    fileHelper.removeFromCloud(imagePublicId);
}