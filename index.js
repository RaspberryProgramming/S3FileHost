const AWS = require('aws-sdk')
const fs = require('fs')
const compression = require('compression')
const Jimp = require('jimp')
const express = require('express')
const fileUpload = require('express-fileupload')
const crypto = require('crypto')
const mustache = require('mustache')
var cookieParser = require('cookie-parser')
const app = express()
const {
    Sequelize,
    Model,
    DataTypes
} = require('sequelize')



// Initialize Sequelize with local database
// You can modify this to work with networked databases
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'database.sqlite',
    logging: false
})

let rawdata = fs.readFileSync('s3.json') // Read s3.json for S3 settings
let s3Data = JSON.parse(rawdata)

// The name of the bucket, and other information will be extracted and S3 api will be setup
const BUCKET_NAME = s3Data.bucket // set the Bucket name

var ep = new AWS.Endpoint(s3Data.endpoint) // Setup the endpoint

const s3 = new AWS.S3({ // Using the endpoint, access key, and secret the S3 will be created and initialized
    endpoint: ep,
    accessKeyId: s3Data.accessKeyId,
    secretAccessKey: s3Data.secretAccessKey
})

/*******************************************
 * Sequelize database setup
 *******************************************/

// Files stores information about each file stored on the server
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

// This database contains a log of IP addresses that have connected to the server
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

// Folders stores the folders for each user that may contain files
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

// Each user's information will be stored here. Because of how it is designed,
//      each user can only be logged into one browser at a time

class users extends Model {}
users.init({
    username: DataTypes.STRING,
    cookie: DataTypes.STRING,
    password: DataTypes.STRING
}, {
    sequelize,
    modelName: 'users'
})

sequelize.sync() // Sync the database


/*******************************************
 * Useful functions
 *******************************************/
function sha512(plaintext) {
    /**
     * Used to generate Sha512 hashes for passwords and such
     */

    let hash = crypto.createHash('sha512')
    // Generate hash function

    data = hash.update(plaintext, 'utf-8')
    // pass plaintext to hash function

    return data.digest('hex') // generate the hash and return it
}

function isIdUnique(table, params) {
    /**
     * isIdUnique: Uses a table and params to see if the parameters are unique to the table
     * 
     * table: sequelize table variable
     * params: sequelize parameters used to query a table
     */
    return table 
        .count({ // Run count query
            where: params
        })
        .then(count => { // after the query runs,

            if (count > 0) { // If there aren't any entries in the query, return false
                return false
            }

            return true // If there are entries, return true
        })
}

function generateID(size) {
    /**
     * generates a random number id using the size parameter passed to the function
     * 
     * size: byte size of the random id that will be returned
     */
       return crypto.randomBytes(size).toString('hex') // generate a hex id with the length of size that was passed to the function
}

function assemblePath(pathArray) {
    /**
     * assemblePath: Assembles an array with elements of a path into a string
     * 
     * pathArray: An array of elements in a path
     */
    let path = '' // Stores the output
    
    for (i in pathArray) { // iterate through the array

        path += '/' + pathArray[i]; // append next array element with / in front of it

    }
    
    if (path === '') { // if the path is empty, set it to /
        path = '/'
    }
    
    return path // return the finished path
}

async function update(table, params, value) {
    /**
     * update: updates an element in a table
     * 
     * table: sequelize table variable
     * params: sequelize variable that stores parameters for a WHERE statement
     * value: the new value
     */

    // Update an element in a table
    table.update(value, {
        where: params
    })
}

function previous(path) {
    /**
     * previous: generates a path at the previous path, and removes the preamble function
     * 
     * path: string for a path
     */
    path = path.split('/') // generates path array
    
    path.shift() // remove preamble
    path.pop() // remove end of path

    return assemblePath(path) // reassemble path and return
}

function retrieve(table, params) {
    /**
     * retrieve: retrieves data from a table based on some parameters. keep in mind this only queries the first element it can find
     * table: sequelize table variable
     * params: WHERE parameters to find some data in the table
     */

    return table // Run the query
        .findOne({
            where: params
        })
        .then(function (item) {
            return item
        })
}

function previewFilter(filename) {
    /**
     * previewFilter: generates preview http path for file preview in Storage Manager
     * 
     * filename: path to file
     */

    // extract file extension
    let extension = filename.split('.')
    extension = extension[extension.length - 1]

    // Array of file types and their extensions
    let extensionTypes = {
        images: ['png', 'jpg', 'jpeg']
    }
    
    // Check if preview is possible
    if (extensionTypes.images.includes(extension)) {
        return filename // Return the original file
    } else {
        return '/images/document.png' // Return default "document.png"
    }
}


app.use(fileUpload()) // Setup fileUpload function when HTTP connection is recieved

app.use(cookieParser()) // Setup cookieParser function when HTTP connection is recieved

app.use(compression()) // Setup compression function when HTTP connection is recieved

app.use(express.json()) // Setup express.json function when HTTP connection is recieved

app.use((req, res, next) => {

    let params = { // generate default values in params
        address: null,
        cookie: null,
        time: Date.now(),
        path: req.path
    };

    if (req.ip) {
        params.address = req.ip // extract browser ip
    }

    if (req.cookies.browserid) { // extract browser cookie
        params.cookie = req.cookies.browserid;
    }

    ipAddresses.create(params); // Append ip info to ipAddresses table
    
    next() // run next function
})



app.use(async function (req, res, next) {
    /**
     * Generates new cookie if the browser doesn't already have one
     */
    let cookie = req.cookies.browserid

    if (cookie === undefined) { // If the cookie is not yet defined

        // Generate new id
        let id = generateID(64);

        // Get response ready with new cookie
        res.cookie('browserid', id, {
            maxAge: 2592000,
            httpOnly: true
        })

        console.log('cookie created successfully') // Log that a new cookie was created
        res.redirect("/") // redirect the user to the index with their new cookie
    } else {

        next() // run next function if a cookie wasn't created
    }
})

app.get('/', async function (req, res, next) {
    /**
     * Return index file
     */

    // Extract file from index.mustache template
    let template = await fs.readFileSync(
        __dirname + '/public/mustache/index.mustache', {
            encoding: 'utf-8'
        }
    )
    
    // Generate a file count
    let fileCount = (await files.findAll()).length

    // Return render from template
    let data = mustache.render(template, {
            fileCount: fileCount
    })

    res.send(data) // Send the index page
})

app.post('/upload*', async function (req, res, next) {
    /**
     * Run when a user sends an upload post
     */
    // extract the path to the file
    let path = await req.path.split('/')
    
    path.shift()
    path.shift()
    
    path = assemblePath(path)

    // Change path to / if it's empty
    if (path === '') {
        path = '/'
    }


    // Using the cookie, query the user from the user's table
    let user = await retrieve(users, {
        cookie: req.cookies.browserid
    })
    
    
    if (req.files && req.files !== null) { // Check if file's exist in the post

        // Determine whether the file is unique
        const uniqueFile = await isIdUnique(files, {
            filename: req.files.myfile.name,
            location: path,
            user: user.dataValues.username
        })

        // Determine whether the folder and path exists
        const uniqueFolder = await isIdUnique(folders, {
            fullpath: path,
            user: user.dataValues.username
        })
        
        // If all is valid, continue to upload the file
        if ((uniqueFile && !uniqueFolder) || (['', '/'].includes(path) && uniqueFile)) {

            // extract the filename of the file
            let filename = req.files.myfile.name

            // generate a unique key id for the new file with length of 128 bytes
            let key = await generateID(128)

            // As long as the id already exists, generate a new one
            while ((await isIdUnique(files, {fileid: key, user: user.dataValues.username}))) {
                key = await generateID(128)
            }

            // generate the parameters to upload the file to the S3
            let params = {
                Bucket: BUCKET_NAME,
                Key: key, // File name you want to save as in S3 (this is different than the actual filename)
                Body: req.files.myfile.data
            }
                    
            // Uploading files to the bucket
            
            s3.upload(params, function (err, data) {
                // Throw an error if it occured
                if (err) {
                    throw err
                }

                // Since the file was correctly uploaded, create a new entry in the files table
                files.create({
                    filename: filename,
                    fileid: key,
                    location: path,
                    lastedit: Date.now(),
                    user: user.dataValues.username,
                    preview: false
                })
                
                // extract the file's extension
                let extension = filename.split('.');
                extension = extension[extension.length - 1]
                
                // If the file is an image file, a preview can be created to help make it more easily noticed in the Storage Manager
                if (['png', 'jpg', 'jpeg'].includes(extension)) {
                    
                    Jimp.read(req.files.myfile.data).then(image => { // Generate a preview file using Jimp
                        
                        image // generate a file with the following parameters
                              // TODO: Change output to WEBP
                            .scaleToFit(512, 512)
                            .quality(50)
                            .getBuffer(Jimp.MIME_JPEG, (err, res) => {

                            // Given that the file is sucessfully created generate new parameters with "-preview appended to the key"
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
                                // retrieve the file from the table
                                let file = await files.findOne({
                                    where: {
                                        fileid: key
                                    }
                                })

                                // Update the file such that preview is true
                                if (file !== null) {
                                    console.log(file)
                                    file.update({
                                        preview: true
                                    })
                                }
                            })
                        })
                    })
                }

                res.redirect(`/download${path}`) // redirect to the original file location

                console.log(`File uploaded successfully. ${data.Location}`)
                })
            } else {
                console.log('Error Uploading file')
                res.send(`Error uploading file`)
            }
    } else if (req.body.filedata && req.body.filedata !== null) { // If the filename was not given in the POST but, filedata was in the body of the POST
        
        // Check if the file exists
        if (!(await isIdUnique(files, {filename: req.body.filename, location: path}))) { // Make sure it exists

            // retrieve the original file
            let file = await retrieve(files, {
                filename: req.body.filename,
                location: path
            })

            // Generate bucket parameters
            let params = {
                Bucket: BUCKET_NAME,
                Key: file.dataValues.fileid, // File name you want to save as in S3
                Body: req.body.filedata
            }

            // Uploading new data to S3 Bucket
            s3.upload(params, function (err, data) {
                if (err) {
                    throw err
                }
            })
        }

    } else {
        // The last possible POST would be a folder request

        // extract the folder from the request
        let folder = req.body.folder

        if (await isIdUnique(folders, {user: user.dataValues.username, fullpath: path + folder})) {
            
            // Create a new folder entry in the folders table
            folders.create({
                foldername: folder,
                path: path,
                fullpath: path + folder,
                lastedit: Date.now(),
                user: user.dataValues.username
            })
        }

            res.redirect(`/download${path}`)
    }
})

app.get('/delete*', async function (req, res, next) {
    /**
     * Used for delete requests of files
     * TODO: Implement folders
     */

    // Extract the path from the http path
    let path = req.path.split('/delete')

    path.shift()
    path.pop()
    
    path = assemblePath(path)

    // Default path to / if it's at root
    if (path === '') {
        path = '/'
    }

    // generate proper filename without spacing representations and split from path
    let filename = req.path.split("%20").join(" ").split('/')
    filename = filename[filename.length-1] // extract filename from array


    // retrieve the user from the browser cookie
    let user = await retrieve(users, {
            cookie: req.cookies.browserid
    })

    // retrieve all files that the user owns in the database
    let fileData = await files.findAll({
            where: {
                    filename: filename,
                    location: path,
                    user: user.dataValues.username
            },
            // Order by lastedit and descending
            order: [
                    ['lastedit', 'DESC']
            ]
    })
    .then(function (file) {
            return file
    })

    // If a file exists, delete it
    if (fileData.length > 0) {
        files.destroy({
            where: {
                id: fileData[0].id,
            }
        })

        res.redirect("/download" + path)
    } else {
        res.send('File could not be deleted')
    }

})

app.get('/download*', async function (req, res, next) {
    /**
     * Used to display Storage Manager and to download files
     */

    // Retrieve the user from their cookie
    let user = await retrieve(users, {
        cookie: req.cookies.browserid
    })

    // If the user exists continue
    if (user !== null) {
        // retrieve the path from the request
        let filename = req.path

        // Replace representations with space and split the full path, then extract the filename
        filename = filename.split("%20").join(" ").split('/')
        filename = filename[filename.length - 1]

        // query the file from the files database
        let file = await retrieve(files, {
            filename: filename
        })

        // retrieve the path from the request and split it into an array
        let fullpath = req.path.split('/')
        
        fullpath.shift() // remove the first two locations
        fullpath.shift()

        // reassemble the path
        fullpath = assemblePath(fullpath)

        // query the folder from the database
        let folder = await retrieve(folders, {
            fullpath: fullpath,
            user: user.dataValues.username
        })

        // If the file exists
        if (file !== null) {
            
            console.log('Trying to download file', file.dataValues.filename)

            // Setup S3 parameters
            let params = {
                Bucket: BUCKET_NAME,
                Key: file.dataValues.fileid
            }

            // attach filename to the response
            res.attachment(file.dataValues.filename)

            // Create filestream from S3 request
            let fileStream = await s3.getObject(params).createReadStream()

            // stream the file to the response
            fileStream.pipe(res)

        } else if (folder !== null || ['', '/'].includes(fullpath)) {
            // If the file does not exist, generate Storage Manager page

            let buttons = '' // stores the buttons for the page

            let fileData = await files // retrieve all files in the current path
                .findAll({
                    where: {
                        location: fullpath,
                        user: user.dataValues.username
                    },
                    order: [
                        // Order each file by lastedit and descending
                        ['lastedit', 'DESC']
                    ]
                })
                    .then(function (file) {
                        return file
                    })

            let folderData = await folders // retrieve all folders within the current path
                .findAll({
                    where: {
                        path: fullpath,
                        user: user.dataValues.username
                    },
                    order: [
                        // Order each file by lastedit and descending
                        ['lastedit', 'DESC']
                    ]
                })
                .then(function (folder) {
                    return folder
                })

            // if the fullpath is / change path to / otherwise copy full path to path
            if (fullpath === '/') {
                path = '/'
            } else {
                path = fullpath
            }

            // for each folder
            for (i in folderData) {
                // generate a new button
                buttons += `<button id="${folderData[i].dataValues.foldername}" class="folder" onclick="window.location.href='/download${path}${folderData[i].dataValues.foldername}';">
                                <img class="file-preview lazy" data-src='/images/folder.png'>
                                ${folderData[i].dataValues.foldername}
                            </button>`
            }

            // for each file
            for (i in fileData) {
                // Generate preview for the file
                let src = previewFilter(
                    '/preview' + path + fileData[i].dataValues.filename
                )

                // generate full file path and filename
                let fullfile = path + fileData[i].dataValues.filename
                let filename = fileData[i].dataValues.filename

                // generate button for the file
                buttons += `<button class="file" id="${filename}" onclick="select('${filename}', '${fullfile}');">
                                <img class="file-preview lazy" data-src='${src}'>
                                ${filename}
                            </button>`
            }

            // extract template from storagemanager.mustache
            let template = await fs.readFileSync(
                __dirname + '/public/mustache/storagemanager.mustache', {
                    encoding: 'utf-8'
                }
            )

            // generate page from template
            let data = mustache.render(template, {
                files: buttons,
                path: path,
                previous: '/download' + previous(fullpath)
            }) 

            // send the template
            res.send(data)
        } else {

            // TODO: GENERATE ERROR PAGE
            // Send "file not found" if no other options work
            res.send('File not found')
        }

    } else {
        
        // if the user doesn't exist, redirect to /login
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
     * When a js file is requested, /public/js is searched
     */
    res.sendFile(__dirname + `/public/js/${req.path.split('/')[2]}`)
    console.log(
        `${req.connection.remoteAddress}:/public/js/${req.path.split('/')[2]}`
    )
})

app.get('/images/*', (req, res) => {
    /**
     * When an image file is requested, /public/images is searched
     */
    let filename = req.path
        .split('/')[req.path.split('/').length - 1].replace(/%20/g, ' ')

    res.sendFile(__dirname + `/public/images/${filename}`)

    console.log(
        `${req.connection.remoteAddress}:/public/css/${req.path.split('/')[1]}`
    )
})

app.get('/editor*', async function (req, res) {
    /**
     * used to generate an editor for a file
     */

    // Extract the filename of the file that will be edited
    let filename = req.path.split('/')[req.path.split('/').length - 1]

    // Generate the full path to the file
    let fullpath = req.path.split('/')

    fullpath.shift()
    fullpath.shift()
    fullpath = assemblePath(fullpath) // Reassemble the fullpath
    
    // Remove the file from the fullpath and store it in path
    let path = previous(fullpath)

    // Extract the extension
    let extension = filename.split('.')[filename.split('.').length - 1]

    // Extract the template from editor.mustache
    let template = await fs.readFileSync(
        __dirname + '/public/mustache/editor.mustache', {
            encoding: 'utf-8'
        }
    )

    // List of filetypes and their valid extensions
    let filetypes = {
        images: ['jpg', 'jpeg', 'png', 'gif'],
        text: ['txt', 'text']
    }

    let editorData = '' // stores the file's data that will be added to the editor

    // If the data does not exist
    if (!isIdUnique(files, {filename: filename, location: path})) {
            
        editorData = '<p> Error: File Not Found </p>'

    } else if (filetypes.images.includes(extension)) { // if the file is an image, set the editor to an image
        
        editorData = `<img src='${'/download/' + filename}' href='${'/download/' + filename}''>`

    } else if (filetypes.text.includes(extension)) { // if the file is a text file
        
        // retrieve the file info from the database
        let file = await retrieve(files, {
            filename: filename,
            location: path
        })

        // generate S3 request
        let params = {
            Bucket: BUCKET_NAME,
            Key: file.dataValues.fileid
        }

        // Retrieve the data of the file
        let fileData = await s3.getObject(params).promise()

        // place the data into the editor
        editorData = `<textarea class="textbox" id="textbox">${fileData.Body.toString()}</textarea><button class="submit" id="submit" onclick="savetxt();">Save</button>`

    } else {
        // Tell the user that this filetype is not yet supported
        editorData = '<p>Not Yet Supported</p>'
    }

    // Generate a response from the template
    let data = await mustache.render(template, {
        editor: editorData,
        file: filename
    })

    // Send response
    res.send(data)
})

app.get('/preview*', async (req, res) => {
        /**
         * Generates a preview of the file when requested
         */

        // if this is a preview page
        if (req.path.split('/')[1] === 'preview-page') {

            // Extract filename, extension and full path
            let filename = req.path.split('/')[req.path.split('/').length - 1]
            let extension = filename.split('.')[filename.split('.').length - 1]
            
            let fullpath = req.path.split('/')
            
            fullpath.shift() // Remove HTTP path
            fullpath.shift()
            
            fullpath = assemblePath(fullpath) // Reassemble the path

            // Extract preview.mustache template
            let template = await fs.readFileSync(
                __dirname + '/public/mustache/preview.mustache', {
                    encoding: 'utf-8'
                }
            )

            // If the file is an image display an image
            if (['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
                
                output = `<img href="/download${fullpath}" src="/download${fullpath}">`

            } else if (['m4v', 'mp4', 'webm'].includes(extension)) { // If the file is a video, display a video
                output = `<video width="320" height="240" controls><source src="/download${fullpath}" type="video/${extension}" /> Your browser does not support the video tag. </video>`

            } else { // Otherwise display "Not yet supported"
                output = 'Not yet supported'
            }

            // Render the template
            let data = mustache.render(template, {
                    preview: output
            })

            // Respond to the user
            res.send(data)
        
        } else { // Otherwise this is a file preview that is being requested
        
            // Extract the filename, extension and fullpath
            let filename = req.path
                .split('/')[req.path.split('/').length - 1].replace(/%20/g, ' ')

            let extension = filename.split('.')[filename.split('.').length - 1]

            let fullpath = req.path.split('/')

            fullpath.shift() // Remove HTTP portion of path
            fullpath.shift()
            
            fullpath = assemblePath(fullpath) // reassemble path
            
            let path = previous(fullpath) // Get path without filename

            // Query the file from files table
            let file = await retrieve(files, {
                filename: filename,
                location: path
            })

            // If the file exists and has a preview
            if (file && file.preview === true) {

                // Generate S3 Parameters
                let params = {
                    Bucket: BUCKET_NAME,
                    Key: file.fileid + '-preview'
                }
                
                // Attach filename to response
                res.attachment(file.dataValues.filename)

                // Stream preview data to fileStream
                let fileStream = await s3.getObject(params).createReadStream()

                // pip response to fileStream
                fileStream.pipe(res)

            } else {
                // If the file does not exist, send picture.svg for images
                if (['jpg', 'jpeg', 'png'].includes(extension)) {
                    res.sendFile(__dirname + `/public/images/picture.svg`)
                } else {
                    // send default document.png
                    res.sendFile(__dirname + `/public/images/document.png`)
                }
            }

            // Tell the browser to cache the file
            res.set('Cache-Control', 'public, max-age=3600')
        }
})

app.get('/login', async (req, res) => {
    // Send login.html
    res.sendFile(__dirname + `/public/html/login.html`)
})

app.get('/register', async (req, res) => {
    // Send register.html
    res.sendFile(__dirname + `/public/html/register.html`)
})

app.post('/register', async (req, res) => {
    /**
     * Register POST with registration information
     */
    let creds = req.body // get the body of the POST

    let user = await retrieve(users, { // query the user from the creds
        username: creds.user
    })

    if (user === null) { // If the user doesn't exist, register them
        // Create a new user entry in the database
        users.create({
            username: creds.user,
            cookie: req.cookies.browserid,
            password: sha512(creds.password)
        })

        // Redirect to the Storage Manager
        res.redirect('/download')
    } else {
        // Redirect the browser back if the user already exists
        res.redirect('/register')
    }
})

app.post('/login', async (req, res) => {
    /**
     * Register POST with login information
     */
    let creds = req.body // get the body of the POST
    
    let password = await retrieve(users, { // get the user from the users table
        username: creds.user
    })
    
    // Check if the user exists, generate hash of the POST's password, and compare to the one in the database
    if (password !== null && sha512(creds.pass) === password.dataValues.password) {

        console.log(`${password.username}} Logged in`)

        // Update the user's cookie
        update(
            users, {
                username: creds.user
            }, {
                cookie: req.cookies.browserid
            }
        )
        
        // redirect them to the Storage Manager
        res.redirect('/download')
    } else {

        // Redirect them to /login if login failed
        res.redirect('/login')
    }
})

app.get('/logout', async (req, res) => {
    /**
     * Logs the user out of their browser
     */
    if (!(await isIdUnique(users, {cookie: req.cookies.browserid}))) {
        update( // Update the user's cookie to be null
            users, {
                cookie: req.cookies.browserid
            }, {
                cookie: null
            }
        )
    }

    // Redirect the user to /login
    res.redirect('/login')
})

app.use((req, res) => {
    // Log the path a user sends
    console.log(req.path)
})

var server = app.listen(3000, function () {
    // Setup web server
    var host = server.address().address
    var port = server.address().port
    // Log at Start
    console.log('Storage Manager listening at http://%s:%s', host, port)
})
