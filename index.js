const AWS = require("aws-sdk");
const fs = require("fs");
const compression = require("compression");
const Jimp = require("jimp");
const express = require("express");
const fileUpload = require("express-fileupload");
const crypto = require("crypto");
const mustache = require("mustache");
const { Sequelize, Model, DataTypes } = require("sequelize");
const app = express();

app.use(fileUpload());

app.use(express.json());

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "database.sqlite",
  logging: false
});

//const app = express();

let rawdata = fs.readFileSync("s3.json");
let s3Data = JSON.parse(rawdata);

// Enter copied or downloaded access ID and secret key here

// The name of the bucket that you have created
const BUCKET_NAME = s3Data.bucket;
var ep = new AWS.Endpoint(s3Data.endpoint);
const s3 = new AWS.S3({
  endpoint: ep,
  accessKeyId: s3Data.accessKeyId,
  secretAccessKey: s3Data.secretAccessKey
});

class files extends Model {}
files.init(
  {
    filename: DataTypes.STRING,
    fileid: DataTypes.STRING,
    location: DataTypes.STRING,
    lastedit: DataTypes.TIME,
    user: DataTypes.STRING,
    preview: DataTypes.BOOLEAN
  },
  {
    sequelize,
    modelName: "files"
  }
);

class folders extends Model {}
folders.init(
  {
    foldername: DataTypes.STRING,
    path: DataTypes.STRING,
    fullpath: DataTypes.STRING,
    lastedit: DataTypes.TIME,
    user: DataTypes.STRING
  },
  {
    sequelize,
    modelName: "folders"
  }
);

class users extends Model {}
users.init(
  {
    username: DataTypes.STRING,
    userID: DataTypes.STRING,
    cookie: DataTypes.STRING,
    password: DataTypes.STRING
  },
  {
    sequelize,
    modelName: "users"
  }
);

sequelize.sync();

function isIdUnique(table, params) {
  return table
    .count({
      where: params
    })
    .then(count => {
      if (count > 0) {
        return false;
      }
      return true;
    });
}

function generateID() {
  return crypto.randomBytes(32).toString("hex");
}

function assemblePath(pathArray) {
  let path = "/";
  for (i in pathArray) {
    if (i === pathArray.length - 1) {
      path += pathArray[i];
    } else {
      path += pathArray[i] + "/";
    }
  }
  return path;
}

function previous(path) {
  if (path === "/") {
    return "/";
  } else {
    path = path.split("/");
    if (path[path.length - 1] === "") {
      let tmp = "";
      for (let i = 0; i < path.length - 2; i++) {
        tmp += path[i] + "/";
      }
      return tmp;
    } else {
      let tmp = "";
      for (let i = 0; i < path.length - 1; i++) {
        tmp += path[i] + "/";
      }
      return tmp;
    }
  }
}

function retrieve(table, params) {
  return table
    .findOne({
      where: params
    })
    .then(function(item) {
      return item;
    });
}

function previewFilter(filename) {
  let extension = filename.split(".");
  extension = extension[extension.length - 1];

  let extensionTypes = {
    images: ["png", "jpg", "jpeg"]
  };
  if (extensionTypes.images.includes(extension)) {
    return filename;
  } else {
    return "/images/document.png";
  }
}

app.use(compression());

app.get("/", async function(req, res, next) {
  let template = await fs.readFileSync(
    __dirname + "/public/mustache/index.mustache",
    {
      encoding: "utf-8"
    }
  );
  let fileCount = (await files.findAll()).length;
  let data = mustache.render(template, {
    fileCount: fileCount
  });
  res.send(data);
});

app.post("/upload*", async function(req, res, next) {
  let path = await req.path.split("/upload");
  path = path[path.length - 1];
  if (path === "") {
    path = "/";
  }
  if (req.files && req.files !== null) {
    if (
      ((await isIdUnique(files, {
        filename: req.files.myfile.name,
        location: path
      })) &&
        !(await isIdUnique(folders, {
          fullpath: path
        }))) ||
      ["", "/"].includes(path)
    ) {
      let filename = req.files.myfile.name;

      let key = await generateID();
      while (
        !(await isIdUnique(files, {
          fileid: key
        }))
      ) {
        let key = await generateID();
      }

      let params = {
        Bucket: BUCKET_NAME,
        Key: key, // File name you want to save as in S3
        Body: req.files.myfile.data
      };
      // Uploading files to the bucket
      s3.upload(params, function(err, data) {
        if (err) {
          throw err;
        }
        files.create({
          filename: filename,
          fileid: key,
          location: path,
          lastedit: Date.now(),
          user: "Default",
          preview: false
        });
        if (
          ["png", "jpg", "jpeg"].includes(
            filename.split(".")[filename.split(".").length - 1]
          )
        ) {
          console.log("key:" + key);

          Jimp.read(req.files.myfile.data).then(image => {
            image.scaleToFit(512, 512).getBuffer(Jimp.MIME_JPEG, (err, res) => {
              console.log(res);
              let params = {
                Bucket: BUCKET_NAME,
                Key: key + "-preview", // File name you want to save as in S3
                Body: res
              };
              // Uploading files to the bucket

              s3.upload(params, async function(err, data) {
                if (err) {
                  throw err;
                }
                console.log("Preview Uploaded");
                let file = await files.findOne({ where: { fileid: key } });
                if (file !== null) {
                  console.log(file);
                  file.update({
                    preview: true
                  });
                }
              });
            });
          });
        }

        res.send(`
      <!doctype html>
      <html>
      <body>
<script>window.location.href = "/download${path}"</script>      
      </body>
      </html>`);

        console.log(`File uploaded successfully. ${data.Location}`);
      });
    } else {
      console.log("Error Uploading file");
      res.send(`Error uploading file`);
    }
  } else {
    let folder = req.body.folder;
    folders.create({
      foldername: folder,
      path: path,
      fullpath: path + folder,
      lastedit: Date.now(),
      user: "default"
    });
    res.send(`
      <!doctype html>
      <html>
      <body>
<script>window.location.href = "/download${path}"</script>      
      </body>
      </html>`);
  }
});

app.get("/download*", async function(req, res, next) {
  // download the file via aws s3 here
  let filename = req.path
    .split("/")
    [req.path.split("/").length - 1].replace(/%20/g, " ");

  let file = await retrieve(files, {
    filename: filename
  });
  let fullpath = req.path.split("/download")[1];
  console.log("Fullpath:" + fullpath);
  let folder = await retrieve(folders, {
    fullpath: fullpath
  });

  if (file !== null) {
    console.log("Trying to download file", file.dataValues.filename);

    let params = {
      Bucket: BUCKET_NAME,
      Key: file.dataValues.fileid
    };

    res.attachment(file.dataValues.filename);
    let fileStream = await s3.getObject(params).createReadStream();
    fileStream.pipe(res);
  } else if (folder !== null || fullpath === "/") {
    let buttons = "";
    let fileData = await files
      .findAll({
        where: {
          location: fullpath
        },
        order: [["lastedit", "DESC"]]
      })
      .then(function(file) {
        return file;
      });

    let folderData = await folders
      .findAll({
        where: {
          path: fullpath
        }
      })
      .then(function(folder) {
        return folder;
      });

    if (fullpath === "/") {
      path = "";
    } else {
      path = fullpath;
    }

    for (i in folderData) {
      buttons += `<button class="file" onclick="window.location.href='/download${path}/${folderData[i].dataValues.foldername}';">
    <img class="file-preview lazy" data-src='/images/folder.png'>
        ${folderData[i].dataValues.foldername}
    </button>`;
    }

    for (i in fileData) {
      let src = previewFilter(
        "/preview" + path + "/" + fileData[i].dataValues.filename
      );

      buttons += `<button class="file" onclick="window.location.href='${src}';">
    <img class="file-preview lazy" data-src='${src}'>
        ${fileData[i].dataValues.filename}
    </button>`;
    }
    let template = await fs.readFileSync(
      __dirname + "/public/mustache/storagemanager.mustache",
      {
        encoding: "utf-8"
      }
    );

    let data = mustache.render(template, {
      files: buttons,
      path: path,
      previous: "/download" + previous(fullpath)
    });
    res.send(data);
  } else {
    res.send("File not found");
  }
});

app.get("*.css", (req, res) => {
  /**
   * When a css file is requested, /public/css is searched
   */
  res.sendFile(__dirname + `/public/css/${req.path.split("/")[1]}`);
  console.log(
    `${req.connection.remoteAddress}:/public/css/${req.path.split("/")[1]}`
  );
});

app.get("/images/*", (req, res) => {
  /**
   * When a css file is requested, /public/css is searched
   */
  let filename = req.path
    .split("/")
    [req.path.split("/").length - 1].replace(/%20/g, " ");

  res.sendFile(__dirname + `/public/images/${filename}`);
  console.log(
    `${req.connection.remoteAddress}:/public/css/${req.path.split("/")[1]}`
  );
});

app.get("/preview*", async (req, res) => {
  /**
   * When a css file is requested, /public/css is searched
   */
  let filename = req.path
    .split("/")
    [req.path.split("/").length - 1].replace(/%20/g, " ");

  let fullpath = req.path.split("/preview")[1];
  let path = previous(fullpath);
  if (path !== "/") {
    path = path.substring(0, path.length - 1);
  }
  console.log(filename);
  console.log(path);
  let file = await retrieve(files, {
    filename: filename,
    location: path
  });
  if (file && file.preview === true) {
    console.log(file.fileid + "-preview");
    console.log(file.filename);
    let params = {
      Bucket: BUCKET_NAME,
      Key: file.fileid + "-preview"
    };
    console.log(file.fileid + "-preview");
    res.attachment(file.dataValues.filename);
    let fileStream = await s3.getObject(params).createReadStream();
    fileStream.pipe(res);
  } else {
    res.sendFile(__dirname + `/public/images/document.png`);
  }
});

app.use((req, res) => {
  console.log(req.path);
});

var server = app.listen(3000, function() {
  var host = server.address().address;
  var port = server.address().port;
  console.log("S3 Proxy app listening at http://%s:%s", host, port);
});

