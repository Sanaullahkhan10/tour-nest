// utils/pictureFiles.js - finds the picture files of one tour in a folder on your computer.
// The names must be: cover.jpg, 1.jpg, 2.jpg and 3.jpg (also .jpeg, .png or .webp, in any letter case).
const fs = require('fs');

const extensions = ['.jpg', '.jpeg', '.png', '.webp'];

// Looks in the list of file names for "baseName" with one of the allowed endings.
function pickFile(fileNames, baseName) {
  for (let i = 0; i < fileNames.length; i++) {
    const lower = fileNames[i].toLowerCase();
    for (let j = 0; j < extensions.length; j++) {
      if (lower === baseName + extensions[j]) {
        return fileNames[i];
      }
    }
  }
  return null;
}

// Gives { cover, gallery }: "cover" is the name of the cover file (or null), "gallery" is the list
// of the files 1, 2 and 3 that exist. Names only, not whole paths. A missing folder means no pictures.
function findTourPictures(folder) {
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    return { cover: null, gallery: [] };
  }

  const fileNames = fs.readdirSync(folder);
  const gallery = [];
  const wanted = ['1', '2', '3'];
  for (let i = 0; i < wanted.length; i++) {
    const found = pickFile(fileNames, wanted[i]);
    if (found) {
      gallery.push(found);
    }
  }
  return { cover: pickFile(fileNames, 'cover'), gallery: gallery };
}

module.exports = {
  findTourPictures,
};
