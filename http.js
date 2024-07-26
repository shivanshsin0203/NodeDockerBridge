const express = require("express");
const getDirectoryTree = require("./tree");
const path = require("path");
const fs = require('fs').promises;
const { exec } = require('child_process');
const kill = require('tree-kill'); 

let childProcess = null;

module.exports = function initHttp(app) {
    app.use(express.json());

    app.post("/project", async (req, res) => {
        const { replId, language } = req.body;
        res.send("Container created successfully! for replId: " + replId + " and language: " + language);
    });

    app.get("/filetree", async (req, res) => {
        const directory = getDirectoryTree(path.join(__dirname, "user"));
        res.json(directory);
    });

    app.get('/filecontent', async (req, res) => {
        try {
            const content = await fs.readFile(req.query.path, 'utf-8');
            return res.json({ content });
        } catch (error) {
            console.error('Error reading file:', error);
            res.status(500).json({ error: 'Failed to read file' });
        }
    });

    app.post('/run', async (req, res) => {
        const userDir = path.resolve(__dirname, "user");

        if (childProcess) {
            return res.status(400).send('Code is already running');
        }

        const nodeModulesExists = await fs.access(path.join(userDir, 'node_modules'))
            .then(() => true)
            .catch(() => false);

        const command = nodeModulesExists ? 'node index.js' : 'npm install && node index.js';

        childProcess = exec(command, { cwd: userDir });

        console.log('Starting child process with command:', command);
        console.log(`Child process started ${childProcess.pid}`);

        let responseSent = false;

        childProcess.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
            if (!responseSent) {
                const match = data.match(/Server running on port (\d+)/);
                if (match) {
                    const port = match[1];
                    res.json({ url: `http://localhost:${port}` });
                    responseSent = true;
                }
            }
        });

        childProcess.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });

        childProcess.on('error', (error) => {
            console.error(`exec error: ${error}`);
            childProcess = null;
            if (!responseSent) {
                res.status(500).send('Error running code');
                responseSent = true;
            }
        });

        childProcess.on('exit', (code, signal) => {
            console.log(`child process exited with code ${code} and signal ${signal}`);
            childProcess = null;
            if (!responseSent) {
                res.status(500).send('Child process exited unexpectedly');
                responseSent = true;
            }
        });
    });

    app.post('/stop', (req, res) => {
        if (childProcess) {
            console.log('Terminating child process', childProcess.pid);

            // Send the response immediately before killing the process
            res.send('Process terminated');

            // Store the PID for logging before killing the process
            const pid = childProcess.pid;

            // Use tree-kill to terminate the process and all subprocesses
            kill(pid, 'SIGTERM', (err) => {
                if (err) {
                    console.error(`Failed to kill process ${pid}:`, err);
                } else {
                    console.log(`Process ${pid} terminated`);
                    childProcess = null;
                }
            });

        } else {
            console.log('No process running to terminate');
            res.status(400).send('No process running');
        }
    });

    app.use('/live', express.static(path.join(__dirname, 'user')));
};
