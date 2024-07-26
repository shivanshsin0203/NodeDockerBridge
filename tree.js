const fs = require('fs');
const path = require('path');

function getDirectoryTree(dirPath) {
    const stats = fs.statSync(dirPath);
    const info = {
        path: dirPath,
        name: path.basename(dirPath),
    };

    if (stats.isDirectory()) {
        info.type = 'folder';
        info.children = fs.readdirSync(dirPath)
            .filter(child => child !== 'node_modules' && child !== 'package-lock.json')
            .map(child => getDirectoryTree(path.join(dirPath, child)));
    } else {
        info.type = 'file';
    }

    return info;
}

module.exports = getDirectoryTree;
