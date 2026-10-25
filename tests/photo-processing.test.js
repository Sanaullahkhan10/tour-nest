// tests/photo-processing.test.js - turning an uploaded file into a safe square photo (real sharp, no database),
// and the small helper that makes the address of a picture.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { makeSquarePhoto, photoSize } = require('../utils/imageProcessing');
const { looksLikeImageId, photoUrl } = require('../utils/photoUrl');

// Makes a plain picture of the given size. "alpha" 0 means fully see-through.
function makePng(width, height, alpha) {
  const background = { r: 200, g: 30, b: 30, alpha: alpha === undefined ? 1 : alpha };
  return sharp({ create: { width: width, height: height, channels: 4, background: background } }).png().toBuffer();
}

// A refusal must be a clear 400 that we threw on purpose.
function isRefusal(error) {
  return error.statusCode === 400 && error.isOperational === true;
}

describe('makeSquarePhoto', () => {
  it('turns a wide picture into a 400 x 400 JPEG', async () => {
    const result = await makeSquarePhoto(await makePng(800, 200));
    assert.equal(result.contentType, 'image/jpeg');
    const info = await sharp(result.data).metadata();
    assert.equal(info.format, 'jpeg');
    assert.equal(info.width, photoSize);
    assert.equal(info.height, photoSize);
    assert.equal(photoSize, 400);
  });

  it('also makes a tiny picture a full square', async () => {
    const info = await sharp((await makeSquarePhoto(await makePng(10, 10))).data).metadata();
    assert.equal(info.width, 400);
    assert.equal(info.height, 400);
  });

  it('accepts JPEG and WebP too', async () => {
    const jpeg = await sharp({ create: { width: 60, height: 40, channels: 3, background: '#336699' } }).jpeg().toBuffer();
    const webp = await sharp({ create: { width: 60, height: 40, channels: 3, background: '#336699' } }).webp().toBuffer();
    assert.equal((await sharp((await makeSquarePhoto(jpeg)).data).metadata()).width, 400);
    assert.equal((await sharp((await makeSquarePhoto(webp)).data).metadata()).width, 400);
  });

  it('removes the hidden notes of a photo (EXIF), like the place where it was taken', async () => {
    const input = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#336699' } })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'secret-note' } })
      .toBuffer();
    assert.ok((await sharp(input).metadata()).exif, 'the test picture should have an EXIF note');

    const output = (await makeSquarePhoto(input)).data;
    assert.equal((await sharp(output).metadata()).exif, undefined);
    assert.ok(!output.includes(Buffer.from('secret-note')));
  });

  it('makes the see-through parts of a PNG white, not black', async () => {
    const output = (await makeSquarePhoto(await makePng(50, 50, 0))).data;
    const pixels = await sharp(output).raw().toBuffer();
    assert.ok(pixels[0] >= 250 && pixels[1] >= 250 && pixels[2] >= 250, 'the corner should be white');
  });

  it('refuses everything that is not a JPEG, PNG or WebP picture', async () => {
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    const samples = {
      gif: gif,
      svg: svg,
      text: Buffer.from('this is not a picture'),
      pdf: Buffer.from('%PDF-1.4 fake'),
      empty: Buffer.alloc(0),
    };
    const names = Object.keys(samples);
    for (let i = 0; i < names.length; i++) {
      await assert.rejects(() => makeSquarePhoto(samples[names[i]]), isRefusal, names[i]);
    }
    await assert.rejects(() => makeSquarePhoto('a string, not a buffer'), isRefusal);
    await assert.rejects(() => makeSquarePhoto(undefined), isRefusal);
  });

  it('refuses a broken picture (the file stops in the middle)', async () => {
    const jpeg = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#336699' } }).jpeg().toBuffer();
    await assert.rejects(() => makeSquarePhoto(jpeg.subarray(0, 60)), isRefusal);
  });

  it('refuses a picture with too many pixels before opening it', async () => {
    const small = await makePng(20, 20);
    await assert.rejects(
      () => makeSquarePhoto(small, { maxPixels: 100 }),
      (error) => isRefusal(error) && error.message.includes('too large')
    );
  });
});

describe('looksLikeImageId and photoUrl', () => {
  it('knows the id of a saved picture: 24 characters, 0-9 and a-f', () => {
    assert.equal(looksLikeImageId('64b7f0c2a1b2c3d4e5f6cccc'), true);
    assert.equal(looksLikeImageId('64B7F0C2A1B2C3D4E5F6CCCC'), false);
    assert.equal(looksLikeImageId('default.jpg'), false);
    assert.equal(looksLikeImageId('64b7f0c2a1b2c3d4e5f6ccc'), false);
    assert.equal(looksLikeImageId('../../etc/passwd'), false);
    assert.equal(looksLikeImageId(undefined), false);
    assert.equal(looksLikeImageId({ $gt: '' }), false);
  });

  it('gives the address of the picture, or of the plain avatar', () => {
    assert.equal(photoUrl({ photo: '64b7f0c2a1b2c3d4e5f6cccc' }), '/img/64b7f0c2a1b2c3d4e5f6cccc');
    assert.equal(photoUrl({ photo: 'default.jpg' }), '/img/default-user.svg');
    assert.equal(photoUrl({}), '/img/default-user.svg');
    assert.equal(photoUrl(null), '/img/default-user.svg');
    assert.equal(photoUrl({ photo: '<script>' }), '/img/default-user.svg');
  });
});
