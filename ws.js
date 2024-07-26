const { Server: SocketServer } = require("socket.io");
const fs = require("fs/promises");
const path = require("path");
const pty = require("node-pty");
const chokidar = require('chokidar');
const os = require('os');
const { default: axios } = require("axios");
const AWS = require('aws-sdk');
const handleDb = require('./db.js');
// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

module.exports = function initWs(server) {
  const initCwd = process.env.INIT_CWD || __dirname;
  const userDir = path.resolve(initCwd, "user");
  let docId;
  console.log("User directory:", userDir);

  async function verifyDirectory(directory) {
    try {
      await fs.access(directory);
      console.log("Directory exists:", directory);
    } catch (error) {
      console.error("Directory does not exist:", directory);
      // Create the directory if it does not exist
      await fs.mkdir(directory, { recursive: true });
      console.log("Directory created:", directory);
    }
  }

  async function uploadDirectoryToS3(directory, bucketName, replId) {
    const uploadFile = async (filePath) => {
      const fileContent = await fs.readFile(filePath);
      const relativePath = path.relative(userDir, filePath);
      const params = {
        Bucket: bucketName,
        Key: `${replId}/${relativePath}`,
        Body: fileContent,
      };

      console.log(`Uploading ${filePath} to ${bucketName}/${replId}/${relativePath}`);
      return s3.upload(params).promise()
        .then((data) => {
          console.log(`Successfully uploaded ${relativePath} to S3:`, data.Location);
        })
        .catch((err) => {
          console.error(`Error uploading ${relativePath} to S3:`, err);
        });
    };

    const walkDirectory = async (dir) => {
      const files = await fs.readdir(dir, { withFileTypes: true });
      const uploadPromises = files.map(async (file) => {
        const filePath = path.join(dir, file.name);
        if (file.isDirectory()) {
           if(file.name === '.git' || file.name === 'node_modules') return;
          return walkDirectory(filePath);
        } else {
          return uploadFile(filePath);
        }
      });
      return Promise.all(uploadPromises);
    };

    return walkDirectory(directory);
  }

  async function downloadFilesFromS3(bucketName, folderName, downloadDir) {
    const listParams = {
      Bucket: bucketName,
      Prefix: folderName,
    };

    const listedObjects = await s3.listObjectsV2(listParams).promise();
    if (listedObjects.Contents.length === 0) {
      console.log(`No files found in S3 for folder ${folderName}`);
      return;
    }

    const downloadPromises = listedObjects.Contents.map(async (object) => {
      const filePath = path.join(downloadDir, path.relative(folderName, object.Key));
      const dirName = path.dirname(filePath);
      await fs.mkdir(dirName, { recursive: true });
      
      const getObjectParams = {
        Bucket: bucketName,
        Key: object.Key,
      };

      const fileData = await s3.getObject(getObjectParams).promise();
      await fs.writeFile(filePath, fileData.Body);
      console.log(`Downloaded ${object.Key} to ${filePath}`);
    });

    return Promise.all(downloadPromises);
  }

  async function downloadFromS3OrFallback(bucketName, replId, fallbackFolder, downloadDir) {
    const replIdExists = await s3.listObjectsV2({ Bucket: bucketName, Prefix: replId }).promise();
    if (replIdExists.Contents.length > 0) {
      console.log(`Folder ${replId} exists in S3. Downloading files...`);
      return downloadFilesFromS3(bucketName, replId, downloadDir);
    } else {
      console.log(`Folder ${replId} does not exist in S3. Downloading files from ${fallbackFolder}...`);
      return downloadFilesFromS3(bucketName, fallbackFolder, downloadDir);
    }
  }

  verifyDirectory(userDir).then(() => {
    console.log("Verified user directory:", userDir);
    let shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-color",
      cols: 80,
      rows: 30,
      cwd: userDir,
      env: process.env,
    });

    const io = new SocketServer({
      cors: "*",
    });
    io.attach(server);

    ptyProcess.onData((data) => {
      io.emit("terminal:data", data);
    });

    chokidar.watch(userDir).on('all', (event, filePath) => {
      io.emit('file:refresh', filePath);
      
    });

    io.on("connection", async (socket) => {
      console.log("A user connected");
      socket.emit('file:refresh');

      socket.on("terminal:write", (data) => {
        console.log("Terminal write:", data);
        ptyProcess.write(data);
      });

      socket.on('set:id', async ({ id }) => {
        docId = id;
        console.log("Document ID set:", docId);
        handleDb(docId, true);
        // Download files from S3 or fallback folder
        try {
          await downloadFromS3OrFallback(process.env.S3_BUCKET_NAME, docId, 'newnode', userDir);
          console.log(`Downloaded files from S3 for replId ${docId} or from fallback folder`);
        } catch (error) {
          console.error(`Error downloading files from S3 for replId ${docId} or fallback folder:`, error);
        }
      });

      socket.on('file:change', async ({ path: filePath, content }) => {
        console.log(`File change received for ${filePath}`);
        try {
          await fs.writeFile(filePath, content);
          console.log(`Successfully wrote content to ${filePath}`);
        } catch (err) {
          console.error(`Error writing to ${filePath}:`, err);
        }
      });

      socket.on("disconnect", async () => {
        console.log("User disconnected");
        handleDb(docId, false);
        try {
          await uploadDirectoryToS3(userDir, process.env.S3_BUCKET_NAME, docId);
          console.log("Uploaded user directory to S3 successfully");
        } catch (error) {
          console.error("Error uploading to S3:", error);
        }
        axios.post('http://localhost:3001/stopcontainer', {docId:docId})
      });
    });
  }).catch(err => {
    console.error("Failed to verify directory:", err);
  });
}
