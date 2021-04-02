const AWS = require('aws-sdk')
const fs = require('fs')
const compression = require('compression')
const Jimp = require('jimp')
const express = require('express')
const fileUpload = require('express-fileupload')
const crypto = require('crypto')
const mustache = require('mustache')
var cookieParser = require('cookie-parser')
const {
        Sequelize,
        Model,
        DataTypes
} = require('sequelize')
const app = express()


const sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: 'database.sqlite',
        logging: false
})

//const app = express();

let rawdata = fs.readFileSync('s3.json')
let s3Data = JSON.parse(rawdata)

// Enter copied or downloaded access ID and secret key here

// The name of the bucket that you have created
const BUCKET_NAME = s3Data.bucket
var ep = new AWS.Endpoint(s3Data.endpoint)
const s3 = new AWS.S3({
        endpoint: ep,
        accessKeyId: s3Data.accessKeyId,
        secretAccessKey: s3Data.secretAccessKey
})

class files extends Model {}
files.init({
        filename: DataTypes.STRING,
        fileid: DataTypes.STRING,
        location: DataTypes.STRING,
        lastedit: DataTypes.TIME,
        user: DataTypes.STRING,
        preview: DataTypes.BOOLEAN
}, {
        sequelize,
        modelName: 'files'
})

class ipAddresses extends Model {}
ipAddresses.init({
        address: DataTypes.STRING,
        cookie: DataTypes.STRING,
        currentUser: DataTypes.STRING,
        time: DataTypes.TIME,
        path: DataTypes.STRING,
}, {
        sequelize,
        modelName: 'ipAddresses'
})

class folders extends Model {}
folders.init({
        foldername: DataTypes.STRING,
        path: DataTypes.STRING,
        fullpath: DataTypes.STRING,
        lastedit: DataTypes.TIME,
        user: DataTypes.STRING
}, {
        sequelize,
        modelName: 'folders'
})

class users extends Model {}
users.init({
        username: DataTypes.STRING,
        cookie: DataTypes.STRING,
        password: DataTypes.STRING
}, {
        sequelize,
        modelName: 'users'
})

sequelize.sync()

function sha512(plaintext) {
        let hash = crypto.createHash('sha512')
        //passing the data to be hashed
        data = hash.update(plaintext, 'utf-8')
        //Creating the hash in the required format
        return data.digest('hex')
}

function isIdUnique(table, params) {
        return table
                .count({
                        where: params
                })
                .then(count => {
                        console.log(count)
                        if (count > 0) {
                                return false
                        }
                        return true
                })
}

function generateID(size) {
        return crypto.randomBytes(size).toString('hex')
}

function assemblePath(pathArray) {
        let path = ''
        for (i in pathArray) {
                path += '/' + pathArray[i]
        }
        if (path === '') {
                path = '/'
        }
        return path
}

async function update(table, params, value) {
        table.update(value, {
                where: params
        })
}

function previous(path) {
        path = path.split('/')
        path.shift()
        path.pop()
        return assemblePath(path)
}

function retrieve(table, params) {
        return table
                .findOne({
                        where: params
                })
                .then(function (item) {
                        return item
                })
}

function previewFilter(filename) {
        let extension = filename.split('.')
        extension = extension[extension.length - 1]

        let extensionTypes = {
                images: ['png', 'jpg', 'jpeg']
        }
        if (extensionTypes.images.includes(extension)) {
                return filename
        } else {
                return '/images/document.png'
        }
}


app.use(fileUpload())

app.use(cookieParser())

app.use(compression())

app.use(express.json())

app.use((req, res, next) => {
        let params = {
                address: null,
                cookie: null,
                time: Date.now(),
                path: req.path
        };

        if (req.ip) {
                params.address = req.ip
        }

        if (req.cookies.browserid) {
                params.cookie = req.cookies.browserid;
        }
        ipAddresses.create(params);
        next()
})



app.use(async function (req, res, next) {
        let cookie = req.cookies.browserid

        if (cookie === undefined) {
                let id = crypto.randomBytes(64).toString('hex')
                console.log(id)
                res.cookie('browserid', id, {
                        maxAge: 2592000,
                        httpOnly: true
                })

                console.log('cookie created successfully')
                res.redirect("/")
        } else {

        next() // <-- important!
        }
})

app.get('/', async function (req, res, next) {
        let template = await fs.readFileSync(
                __dirname + '/public/mustache/index.mustache', {
                        encoding: 'utf-8'
                }
        )
        let fileCount = (await files.findAll()).length
        let data = mustache.render(template, {
                fileCount: fileCount
        })
        res.send(data)
})

app.post('/upload*', async function (req, res, next) {
        let path = await req.path.split('/')
        path.shift()
        path.shift()
        path = assemblePath(path)

        let user = await retrieve(users, {
                cookie: req.cookies.browserid
        })
        console.log(user)

        if (path === '') {
                path = '/'
        }
        if (req.files && req.files !== null) {
                const uniqueFile = await isIdUnique(files, {
                        filename: req.files.myfile.name,
                        location: path,
                        user: user.dataValues.username
                })
                const uniqueFolder = await isIdUnique(folders, {
                        fullpath: path,
                        user: user.dataValues.username
                })
                if (
                        (uniqueFile && !uniqueFolder) ||
                        (['', '/'].includes(path) && uniqueFile)
                ) {
                        let filename = req.files.myfile.name

                        let key = await generateID(128)
                        while (
                                !(await isIdUnique(files, {
                                        fileid: key,
                                        user: user.dataValues.username
                                }))
                        ) {
                                let key = await generateID(128)
                        }

                        let params = {
                                Bucket: BUCKET_NAME,
                                Key: key, // File name you want to save as in S3
                                Body: req.files.myfile.data
                        }
                        
                        // Uploading files to the bucket
                        
                        s3.upload(params, function (err, data) {
                                if (err) {
                                        throw err
                                }
                                files.create({
                                        filename: filename,
                                        fileid: key,
                                        location: path,
                                        lastedit: Date.now(),
                                        user: user.dataValues.username,
                                        preview: false
                                })
                                if (
                                        ['png', 'jpg', 'jpeg'].includes(
                                                filename.split('.')[filename.split('.').length - 1]
                                        )
                                ) {
                                        console.log('key:' + key)

                                        Jimp.read(req.files.myfile.data).then(image => {
                                                image
                                                        .scaleToFit(512, 512)
                                                        .quality(50)
                                                        .getBuffer(Jimp.MIME_JPEG, (err, res) => {
                                                                console.log(res)
                                                                let params = {
                                                                        Bucket: BUCKET_NAME,
                                                                        Key: key + '-preview', // File name you want to save as in S3
                                                                        Body: res
                                                                }
                                                                // Uploading files to the bucket

                                                                s3.upload(params, async function (err, data) {
                                                                        if (err) {
                                                                                throw err
                                                                        }
                                                                        console.log('Preview Uploaded')
                                                                        let file = await files.findOne({
                                                                                where: {
                                                                                        fileid: key
                                                                                }
                                                                        })
                                                                        if (file !== null) {
                                                                                console.log(file)
                                                                                file.update({
                                                                                        user: user.dataValues.username,
                                                                                        preview: true
                                                                                })
                                                                        }
                                                                })
                                                        })
                                        })
                                }

                                res.send(`
      <!doctype html>
      <html>
      <body>
<script>window.location.href = "/download${path}"</script>      
      </body>
      </html>`)

                                console.log(`File uploaded successfully. ${data.Location}`)
                        })
                } else {
                        console.log('Error Uploading file')
                        res.send(`Error uploading file`)
                }
        } else if (req.body.filedata && req.body.filedata !== null) {
                console.log(req.body.filename)
                console.log(path)
                if (
                        !(await isIdUnique(files, {
                                filename: req.body.filename,
                                location: path
                        }))
                ) {
                        let file = await retrieve(files, {
                                filename: req.body.filename,
                                location: path
                        })
                        console.log(file.location)
                        let params = {
                                Bucket: BUCKET_NAME,
                                Key: file.dataValues.fileid, // File name you want to save as in S3
                                Body: req.body.filedata
                        }
                        // Uploading files to the bucket
                        s3.upload(params, function (err, data) {
                                if (err) {
                                        throw err
                                }
                        })
                }
        } else {
                let folder = req.body.folder
                console.log(path + folder)
                console.log(user.dataValues.username)

                if (
                        await isIdUnique(folders, {
                                user: user.dataValues.username,
                                fullpath: path + folder
                        })
                )
                        folders.create({
                                foldername: folder,
                                path: path,
                                fullpath: path + folder,
                                lastedit: Date.now(),
                                user: user.dataValues.username
                        })
                res.send(`
      <!doctype html>
      <html>
      <body>
<script>window.location.href = "/download${path}"</script>      
      </body>
      </html>`)
        }
})

app.get('/download*', async function (req, res, next) {
        // download the file via aws s3 here
        let user = await retrieve(users, {
                cookie: req.cookies.browserid
        })

        if (user !== null) {
                let filename = req.path

                filename = filename.split("%20").join(" ").split('/')
                filename = filename[filename.length - 1]

                let file = await retrieve(files, {
                        filename: filename
                })
                let fullpath = req.path.split('/')
                fullpath.shift()
                fullpath.shift()
                fullpath = assemblePath(fullpath)
                console.log('Fullpath:' + fullpath)

                let folder = await retrieve(folders, {
                        fullpath: fullpath,
                        user: user.dataValues.username
                })

                if (file !== null) {
                        console.log('Trying to download file', file.dataValues.filename)

                        let params = {
                                Bucket: BUCKET_NAME,
                                Key: file.dataValues.fileid
                        }

                        res.attachment(file.dataValues.filename)
                        let fileStream = await s3.getObject(params).createReadStream()
                        fileStream.pipe(res)
                } else if (folder !== null || ['', '/'].includes(fullpath)) {
                        let buttons = ''
                        let fileData = await files
                                .findAll({
                                        where: {
                                                location: fullpath,
                                                user: user.dataValues.username
                                        },
                                        order: [
                                                ['lastedit', 'DESC']
                                        ]
                                })
                                .then(function (file) {
                                        return file
                                })

                        let folderData = await folders
                                .findAll({
                                        where: {
                                                path: fullpath,
                                                user: user.dataValues.username
                                        }
                                })
                                .then(function (folder) {
                                        return folder
                                })

                        if (fullpath === '/') {
                                path = '/'
                        } else {
                                path = fullpath
                        }

                        for (i in folderData) {
                                buttons += `<button id="${folderData[i].dataValues.foldername}" class="folder" onclick="window.location.href='/download${path}${folderData[i].dataValues.foldername}';">
    <img class="file-preview lazy" data-src='/images/folder.png'>
        ${folderData[i].dataValues.foldername}
    </button>`
                        }

                        for (i in fileData) {
                                let src = previewFilter(
                                        '/preview' + path + fileData[i].dataValues.filename
                                )
                                let fullfile = path + fileData[i].dataValues.filename
                                let filename = fileData[i].dataValues.filename

                                buttons += `<button class="file" id="${filename}" onclick="select('${filename}', '${fullfile}');">
      <img class="file-preview lazy" data-src='${src}'>
          ${filename}
      </button>`
                        }
                        let template = await fs.readFileSync(
                                __dirname + '/public/mustache/storagemanager.mustache', {
                                        encoding: 'utf-8'
                                }
                        )

                        let data = mustache.render(template, {
                                files: buttons,
                                path: path,
                                previous: '/download' + previous(fullpath)
                        })
                        res.send(data)
                } else {
                        res.send('File not found')
                }
        } else {
                res.redirect('/login')
        }
})

app.get('/css/*.css', (req, res) => {
        /**
         * When a css file is requested, /public/css is searched
         */
        res.sendFile(__dirname + `/public/css/${req.path.split('/')[2]}`)
        console.log(
                `${req.connection.remoteAddress}:/public/css/${req.path.split('/')[2]}`
        )
})

app.get('/js/*.js', (req, res) => {
        /**
         * When a css file is requested, /public/css is searched
         */
        res.sendFile(__dirname + `/public/js/${req.path.split('/')[2]}`)
        console.log(
                `${req.connection.remoteAddress}:/public/js/${req.path.split('/')[2]}`
        )
})

app.get('/images/*', (req, res) => {
        /**
         * When a css file is requested, /public/css is searched
         */
        let filename = req.path
                .split('/')[req.path.split('/').length - 1].replace(/%20/g, ' ')

        res.sendFile(__dirname + `/public/images/${filename}`)
        console.log(
                `${req.connection.remoteAddress}:/public/css/${req.path.split('/')[1]}`
        )
})

app.get('/editor*', async function (req, res) {
        let filename = req.path.split('/')[req.path.split('/').length - 1]
        let fullpath = req.path.split('/')
        fullpath.shift()
        fullpath.shift()
        fullpath = assemblePath(fullpath)
        let path = previous(fullpath)

        let extension = filename.split('.')[filename.split('.').length - 1]
        let template = await fs.readFileSync(
                __dirname + '/public/mustache/editor.mustache', {
                        encoding: 'utf-8'
                }
        )

        let filetypes = {
                images: ['jpg', 'jpeg', 'png', 'gif'],
                text: ['txt', 'text']
        }
        let editorData = ''
        if (
                !isIdUnique(files, {
                        filename: filename,
                        location: path
                })
        ) {
                let data = 'Error: File Not Found'
        } else if (filetypes.images.includes(extension)) {
                editorData = `<img src='${'/download' + filename}' href='${'/download' +
      filename}''>`
        } else if (filetypes.text.includes(extension)) {
                console.log(path)
                let file = await retrieve(files, {
                        filename: filename,
                        location: path
                })

                let params = {
                        Bucket: BUCKET_NAME,
                        Key: file.dataValues.fileid
                }

                let fileData = await s3.getObject(params).promise()
                editorData = `<textarea class="textbox" id="textbox">${fileData.Body.toString()}</textarea><button class="submit" id="submit" onclick="savetxt();">Save</button>`

                console.log(editorData)
        } else {
                editorData = 'Not Yet Supported'
        }

        let data = await mustache.render(template, {
                editor: editorData,
                file: filename
        })
        console.log(data)
        res.send(data)
})

app.get('/preview*', async (req, res) => {
        /**
         * When a css file is requested, /public/css is searched
         */

        if (req.path.split('/')[1] === 'preview-page') {
                let filename = req.path.split('/')[req.path.split('/').length - 1]
                let extension = filename.split('.')[filename.split('.').length - 1]
                let fullpath = req.path.split('/')
                fullpath.shift()
                fullpath.shift()
                console.log(fullpath)
                fullpath = assemblePath(fullpath)

                let template = await fs.readFileSync(
                        __dirname + '/public/mustache/preview.mustache', {
                                encoding: 'utf-8'
                        }
                )
                let output
                if (['jpg', 'jpeg', 'png'].includes(extension)) {
                        output = `<img href="/download${fullpath}" src="/download${fullpath}">`
                } else if (['m4v', 'mp4', 'webm'].includes(extension)) {
                        output = `<video width="320" height="240" controls><source src="/download${fullpath}" type="video/${extension}" /> Your browser does not support the video tag.
                        </video>`
                } else {
                        output = 'Not yet supported'
                }

                let data = mustache.render(template, {
                        preview: output
                })
                res.send(data)
        } else {
                let filename = req.path
                        .split('/')[req.path.split('/').length - 1].replace(/%20/g, ' ')

                let extension = filename.split('.')[filename.split('.').length - 1]

                let fullpath = req.path.split('/')
                fullpath.shift()
                fullpath.shift()
                fullpath = assemblePath(fullpath)
                let path = previous(fullpath)
                let file = await retrieve(files, {
                        filename: filename,
                        location: path
                })
                console.log(path)
                if (file && file.preview === true) {
                        let params = {
                                Bucket: BUCKET_NAME,
                                Key: file.fileid + '-preview'
                        }
                        res.attachment(file.dataValues.filename)
                        let fileStream = await s3.getObject(params).createReadStream()
                        fileStream.pipe(res)
                } else {
                        if (['jpg', 'jpeg', 'png'].includes(extension)) {
                                res.sendFile(__dirname + `/public/images/picture.svg`)
                        } else {
                                res.sendFile(__dirname + `/public/images/document.png`)
                        }
                }
                res.set('Cache-Control', 'public, max-age=3600')
                res.set('Content-Disposition', 'inline')
        }
})

app.get('/login', async (req, res) => {
        res.sendFile(__dirname + `/public/html/login.html`)
})

app.get('/register', async (req, res) => {
        res.sendFile(__dirname + `/public/html/register.html`)
})

app.post('/register', async (req, res) => {
        let creds = req.body
        let user = await retrieve(users, {
                username: creds.user
        })

        if (user === null) {
                users.create({
                        username: creds.user,
                        cookie: req.cookies.browserid,
                        password: sha512(creds.password)
                })
                res.redirect('/download')
        } else {
                res.redirect('/register')
        }
})

app.post('/login', async (req, res) => {
        let creds = req.body
        let password = await retrieve(users, {
                username: creds.user
        })
        console.log(password)

        if (
                password !== null &&
                sha512(creds.pass) === password.dataValues.password
        ) {
                console.log('Logged in')
                update(
                        users, {
                                username: creds.user
                        }, {
                                cookie: req.cookies.browserid
                        }
                )
                res.redirect('/download')
        } else {
                res.redirect('/login')
        }
})

app.get('/pull*', async (req, res) => {
        let exec = require('child_process').exec
        let command = 'git pull'
        exec('git pull', (error, stdout, stderr) => {
                if (error) {
                        console.log(`error: ${error.message}`)
                } else if (stderr) {
                        console.log(`stderr: ${stderr}`)
                } else {
                        exec('git pull', (error, stdout, stderr) => {
                                if (error) {
                                        console.log(`error: ${error.message}`)
                                } else if (stderr) {
                                        console.log(`stderr: ${stderr}`)
                                } else {
                                        console.log(stdout)
                                }
                        })
                }
        })
})

app.get('/logout', async (req, res) => {
        if (
                !(await isIdUnique(users, {
                        cookie: req.cookies.browserid
                }))
        ) {
                update(
                        users, {
                                cookie: req.cookies.browserid
                        }, {
                                cookie: null
                        }
                )
        }
        res.redirect('/login')
})

app.use((req, res) => {
        console.log(req.path)
})

var server = app.listen(3000, function () {
        var host = server.address().address
        var port = server.address().port
        console.log('S3 Proxy app listening at http://%s:%s', host, port)
})
