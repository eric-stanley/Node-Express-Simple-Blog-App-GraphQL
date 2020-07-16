const express = require('express');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const { graphqlHTTP } = require('express-graphql');
const referrerPolicy = require('referrer-policy');

const fileHelper = require('./util/file');
const graphqlSchema = require('./graphql/schema');
const graphqlResolver = require('./graphql/resolvers');
const auth = require('./middleware/auth');

dotenv.config();
const app = express();

const MONGODB_URI = 'mongodb+srv://' + process.env.MONGODB_USERNAME +
    ':' + process.env.MONGODB_PASSWORD +
    '@' + process.env.MONGODB_CLUSTER + '/' +
    process.env.MONGODB_DATABASE + '?retryWrites=true&w=majority';

app.use(bodyParser.json());
app.use('/images', express.static(path.join(__dirname, 'images')));

app.use(fileHelper.upload.single('image'));
app.use(fileHelper.imageStore.uploadToCloud);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT, PATCH, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(referrerPolicy({ policy: 'same-origin' }));

// app.use(cors({ 
//   origin: '*',
//   methods: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
//   allowedHeaders: 'Content-Type, Authorization'
// }));

app.use(auth);

app.put('/post-image', (req, res, next) => {
  if(!req.isAuth) {
    throw new Error('Not authenticated!');
  }

  if(!req.file) {
    return res
      .status(200)
      .json({
        message: 'No file provided'
      });
  }

  if(req.body.oldPublicId) {
    deleteImage(req.body.oldPublicId);
  }

  return res
    .status(201)
    .json({
      message: 'File saved',
      filePath: req.image.url,
      filePublicId: req.image.public_id,
      fileAssetId: req.image.asset_id
    })
})

app.use('/graphql', graphqlHTTP({
  schema: graphqlSchema,
  rootValue: graphqlResolver,
  graphiql: true,
  customFormatErrorFn(err) {
    
    if(!err.originalError) {
      return err;
    }

    const data = err.originalError.data;
    const message = err.message || 'An error occurred';
    const code = err.originalError.code || 500;

    return {
      message: message,
      status: code,
      data: data
    }
  }
}));

app.use((err, req, res, next) => {
    console.log(err);
    const status = err.statusCode || 500;
    const message = err.message;
    const data = err.data
    res
        .status(status)
        .json({
            message: message,
            data: data
        });
})

mongoose
  .connect(MONGODB_URI, {
    useUnifiedTopology: true,
    useNewUrlParser: true
  })
  .then(result => {
    app.listen(process.env.PORT || 3200);
    console.log(`App started listening to port ${process.env.PORT}`)
  })
  .catch(err => console.log(err));

const deleteImage = (imagePublicId) => {
  fileHelper.removeFromCloud(imagePublicId);
}
