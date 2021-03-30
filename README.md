# S3FileHost

## Prerequisits

- A Machine to run on : https://vultr.com
- Nodejs : https://docs.npmjs.com/downloading-and-installing-node-js-and-npm
- npm : https://docs.npmjs.com/downloading-and-installing-node-js-and-npm
- S3 Object Storage Bucket, keys, endpoint : https://vultr.com

## Install

Clone the Repository

`git clone https://github.com/RaspberryProgramming/S3FileHost`

Enter the Project

`cd S3FileHost`

Install node dependencies

`npm install`

Edit the s3.json (example below)

`
{
        "accessKeyId": "ABC1231JKAJ221A",
        "secretAccessKey": "ha81ja9jk3kk1jn2b5g19foas",
        "endpoint": "s3.server.com",
        "bucket": "S3FileHostBucket"
}
`

Run the server

`node index.js`


Now you can connect to the website

`IPADDRESS:3000`
