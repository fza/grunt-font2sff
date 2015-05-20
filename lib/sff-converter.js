'use strict';

var fs = require('fs');
var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var thr = require('format-throw');
var _ = require('lodash');
var fontkit = require('fontkit');
var SVGPath = require('svgpath');
var compressPath = require('./compress-path');

var UNITS_PER_EM = 1000;
var SFF_MAGIC = 'SFF';
var SFF_VERSION = 1;

function md5(data) {
  return crypto.createHash('md5').update(data).digest('hex');
}

function pack(val, format) {
  var buf;
  var len, lenBuf;
  var type = typeof val;
  switch (type) {
    // String
    case 'string':
      len = val.length;
      buf = new Buffer(2 + Buffer.byteLength(val, 'utf8'));
      buf.writeUInt16BE(len, 0);
      buf.write(val, 2, len, 'utf8');
      break;

    // Integer
    case 'number':
      switch (format || 'int32') {
        case 'uint16':
          buf = new Buffer(2);
          buf.writeUInt16BE(val, 0);
          break;

        case 'int16':
          buf = new Buffer(2);
          buf.writeInt16BE(val, 0);
          break;

        case 'uint32':
          buf = new Buffer(4);
          buf.writeUInt32BE(val, 0);
          break;

        case 'int32':
          buf = new Buffer(4);
          buf.writeInt32BE(val, 0);
          break;

        default:
          thr('Unknown integer format: %s', format);
      }
      break;

    // Collection
    case 'object':
      if (Buffer.isBuffer(val)) {
        len = val.length;
        lenBuf = new Buffer(2);
        lenBuf.writeUInt16BE(len, 0);
        buf = Buffer.concat([lenBuf, val]);
      } else if (Array.isArray(val)) {
        buf = Buffer.concat(val);

        switch (format || 'array') {
          case 'array':
            lenBuf = new Buffer(2);
            lenBuf.writeUInt16BE(val.length, 0);
            buf = Buffer.concat([lenBuf, buf]);
            break;

          case 'table':
            break;

          default:
            thr('Unknown collection format: %s', format);
        }
      } else {
        thr('Cannot pack data of type: object');
      }
      break;

    default:
      thr('Cannot pack data of type: %s', type);
  }

  return buf;
}

/**
 * Converts OTF/TTF/WOFF/WOFF2 to SFF.
 *
 * All strings are UTF8 encoded. All integers are big endian. Each glyph is normalized to
 * 1000 units-per-em. Glyph paths are normalized with correct "real" inline y-positioning.
 *
 * TABLE = (data)
 * ARRAY = (uint16 (item count) + data)
 * UTF8_STRING = (uint16 (byte length) + data)
 * BYTE_SEQ = (uint16 (byte length) + data)
 *
 *   (TABLE) header {
   *     (UTF8_STRING) postscript name
   *     (UTF8_STRING) copyright
   *     (UTF8_STRING) version
   *     (int16) ascent
   *     (int16) descent
   *     (int16) lineGap
   *     (int16) underlinePosition (y = ascent - underlinePosition)
   *     (int16) underlineThickness
   *   }
 *   (ARRAY) glyph data items [
 *     (TABLE) glyph data item {
   *       (ARRAY) code points [
   *         (uint16) code point
   *       ]
   *       (uint16) glyph width
   *       (BYTE_SEQ) Compressed SVG path
   *     }
 *   ]
 *   (ARRAY) kerning data () [
 *     (TABLE) {
   *       (uint16) character code of left glyph
   *       (ARRAY) [
   *         (TABLE) {
   *           (uint16) character code of right glyph
   *           (int16) advance
   *         }
   *       ]
   *     }
 *   ]
 */
function SffConverter(subset) {
  EventEmitter.call(this);

  this.subset = subset;
  this.jaded = false;
}

inherits(SffConverter, EventEmitter);

SffConverter.prototype.convert = function (srcFile, destFile) {
  if (this.jaded) {
    throw new Error('SffConverter already jaded.');
  }

  try {
    this.font = fontkit.openSync(srcFile);
  } catch (e) {
    return this.emit('error', thr.make('Unable to read font file: %s', srcFile));
  }

  this.jaded = true;

  this.oStream = null;
  this.srcFile = srcFile;
  this.scaleFactor = UNITS_PER_EM / this.font.unitsPerEm;

  try {
    this.glyphMap = {};
    this.includedCharCodes = [];
    this._prepareGlyphMap();

    this.oStream = fs.createWriteStream(destFile);
    this.oStream.once('finish', this.emit.bind(this, 'finish'));

    this._writeFileHeader();
    this._writeFontHeader();
    this._writeGlyphTable();
    this._writeKerningMap();

    this.oStream.end();
  } catch (e) {
    this.emit('error', e);
  }
};

SffConverter.prototype._prepareGlyphMap = function () {
  var self = this;

  var glyphCount = 0;
  this.glyphMap = {};
  this.subset.forEach(function (charCode) {
    if (!self.font.hasGlyphForCodePoint(charCode)) {
      return;
    }

    glyphCount++;
    self.includedCharCodes.push(charCode);

    var glyph = self.font.glyphForCodePoint(charCode);
    var glyphAdv = glyph.advanceWidth;
    var glyphPath = new SVGPath(glyph.path.toSVG())
      .scale(self.scaleFactor)
      .translate(0, self.font.ascent)
      .round(1)
      .toString();

    var hash = md5(glyphAdv + glyphPath);
    if (self.glyphMap[hash]) {
      self.glyphMap[hash].codePoints.push(charCode);
    } else {
      self.glyphMap[hash] = {
        codePoints: [charCode],
        path: glyphPath,
        advance: glyphAdv
      };
    }
  });

  if (glyphCount === 0) {
    thr('Font did not have any of the selected characters: %s', this.srcFile);
  }
};

SffConverter.prototype._writeFileHeader = function () {
  this.oStream.write(SFF_MAGIC);
  this.oStream.write(pack(SFF_VERSION, 'uint16'));
};

SffConverter.prototype._writeFontHeader = function () {
  this.oStream.write(pack([
    pack(this.font.postscriptName),
    pack(this.font.copyright),
    pack(this.font.version),
    pack(UNITS_PER_EM, 'uint16'),
    pack(this.font.ascent * this.scaleFactor, 'int16'),
    pack(this.font.descent * this.scaleFactor, 'int16'),
    pack(this.font.lineGap * this.scaleFactor, 'int16'),
    pack(this.font.underlinePosition * this.scaleFactor, 'int16'),
    pack(this.font.underlineThickness * this.scaleFactor, 'int16')
  ], 'table'));
};

SffConverter.prototype._writeGlyphTable = function () {
  var glyphArrayBufs = [];
  _.each(this.glyphMap, function (glyphData) {
    glyphArrayBufs.push(pack([
      pack(glyphData.codePoints.map(function (charCode) {
        return pack(charCode, 'uint16');
      }), 'array'),
      pack(glyphData.advance, 'uint16'),
      pack(compressPath(glyphData.path))
    ], 'table'));
  });

  this.oStream.write(pack(glyphArrayBufs, 'array'));
};

SffConverter.prototype._writeKerningMap = function () {
  var self = this;

  var kerningArrayBufs = [];
  var leftStr, bufs;
  var glyphs, advances, offset;
  this.includedCharCodes.forEach(function (charCodeLeft) {
    leftStr = String.fromCharCode(charCodeLeft);
    bufs = [];

    self.includedCharCodes.forEach(function (charCodeRight) {
      glyphs = self.font.glyphsForString(leftStr + String.fromCharCode(charCodeRight), ['kern']);
      advances = self.font.advancesForGlyphs(glyphs, ['kern']);
      offset = advances[0] - glyphs[0].advanceWidth;

      if (offset !== 0) {
        bufs.push(pack([
          pack(charCodeRight, 'uint16'),
          pack(offset, 'int16')
        ], 'table'));
      }
    });

    if (bufs.length) {
      kerningArrayBufs.push(pack([
        pack(charCodeLeft, 'uint16'),
        pack(bufs, 'array')
      ], 'table'));
    }
  });

  this.oStream.write(pack(kerningArrayBufs, 'array'));
};

module.exports = SffConverter;
