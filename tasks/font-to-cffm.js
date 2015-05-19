'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var util = require('util');
var _ = require('lodash');
var fontkit = require('fontkit');
var SVGPath = require('svgpath');

var UNITS_PER_EM = 1000;
var CFFM_MAGIC = 'CFFM';
var CFFM_VERSION = 1;

var unicodeRanges = {
  basicLatin: [0x20, 0x7f],
  latinSupplement: [0x80, 0xff],
  extendedLatinA: [0x0100, 0x17f],
  extendedLatinB: [0x180, 0x024f],
  ipaExtension: [0x0250, 0x02af],
  greek: [0x0370, 0x03ff],
  phonetic: [0x1d00, 0x1dbf],
  punctuation: [0x2000, 0x206f],
  currencySymbols: [0x20a0, 0x20ba], // only a subset
  mathSymbols: [0x2200, 0x227f],
  latinLowercase: [
    [0x61, 0x7a],
    [0xc0, 0xd6],
    [0xd8, 0xde]
  ],
  latinUppercase: [
    [0x41, 0x5a],
    [0xdf, 0xf6],
    [0xf8, 0xff]
  ],
  extendedSymbols: [
    [0xa0, 0xbf],
    [0xd7],
    [0xf7]
  ],
  english: [
    'basicLatin',
    'extendedSymbols',
    'punctuation'
  ],
  german: [
    'english',
    [0xc4], // Ä
    [0xd6], // Ö
    [0xdc], // Ü
    [0xe4], // ä
    [0xf6], // ö
    [0xfc]  // ü
  ],
  westernEuropean: [
    'basicLatin',
    'latinSupplement',
    'extendedLatinA',
    'extendedLatinB',
    'ipaExtensions',
    'phonetic',
    'punctuation',
    'currencySymbols'
  ]
};

function md5(data) {
  return crypto.createHash('md5').update(data).digest('hex');
}

module.exports = function (grunt) {

  function pack(val, format) {
    var buf;
    var type = typeof val;
    switch (type) {
      // UTF8 String
      case 'string':
        var len = val.length;
        buf = new Buffer(2 + Buffer.byteLength(val, 'utf8'));
        buf.writeUInt16BE(len, 0);
        buf.write(val, 2, len, 'utf8');
        break;

      // Table
      case 'object':
        if (Buffer.isBuffer(val)) {
          return val;
        } else if (Array.isArray(val)) {
          buf = Buffer.concat(val);

          switch (format || 'array') {
            case 'array':
              var lenBuf = new Buffer(2);
              lenBuf.writeUInt16BE(val.length, 0);
              buf = Buffer.concat([lenBuf, buf]);
              break;

            case 'table':
              break;

            default:
              grunt.fail.fatal('Unknown collection format: ' + format);
          }
        } else {
          grunt.fail.fatal('Cannot pack type: object');
        }
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
            grunt.fail.fatal('Unknown integer format: ' + format);
        }
        break;

      default:
        grunt.fail.fatal('Cannot pack type: ' + type);
    }

    return buf;
  }

  function makeSubset(charsets, includeCharsets, excludeCharsets) {
    function numericCompare(a, b) {
      return a - b;
    }

    function numberOrRange(val) {
      var result = [];
      if (val.length === 2) {
        for (var charCode = val[0]; charCode <= val[1]; charCode++) {
          result.push(charCode);
        }
      } else {
        result = val[0];
      }

      return result;
    }

    function expand(charsetList) {
      var charCodeList = [];

      if (!util.isArray(charsetList)) {
        charsetList = [charsetList];
      }

      if (util.isNumber(charsetList[0])) {
        charCodeList = charCodeList.concat(numberOrRange(charsetList));
      } else {
        charsetList.forEach(function (charset) {
          var list;

          if (util.isString(charset)) {
            if (!unicodeRanges[charset]) {
              grunt.fail.fatal('Charset not defined: ' + charset);
            }

            list = expand(unicodeRanges[charset]);
          } else {
            list = numberOrRange(charset);
          }

          charCodeList = charCodeList.concat(list);
        });
      }

      return _.uniq(charCodeList);
    }

    var subset = expand(charsets);
    var excludeSubset = includeCharsets ? expand(includeCharsets) : [];
    var includeSubset = excludeCharsets ? expand(excludeCharsets) : [];
    subset = _.uniq(_.difference(subset, excludeSubset).concat(includeSubset), true);
    subset.sort(numericCompare);

    return subset;
  }

  /**
   * Reads ttf/woff/woff2 font files and constructs a new binary file for each font.
   * All strings are UTF8 encoded. All integers are big endian. Each glyph is normalized to
   * 1000 units-per-em. Glyph paths are also normalized, with correct inline y-positioning.
   *
   * TABLE = (data)
   * ARRAY = (uint16 (item count) + item data)
   * UTF8_STRING = (uint16 (length) + utf8 data)
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
   *       (UTF8_STRING) SVG path
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
  grunt.registerMultiTask('font2cffm', 'Convert fonts to CFFM', function () {
    var opts = this.options({
      charsets: ['english'],
      excludeCharsets: undefined,
      includeCharsets: undefined
    });

    var subset = makeSubset(opts.charsets, opts.excludeCharsets, opts.includeCharsets);

    if (subset.length === 0) {
      grunt.fail.warn('Selected character subset contains no characters.');
      return;
    }

    this.files.forEach(function (f) {
      if (grunt.file.exists(f.dest) && grunt.file.isFile(f.dest)) {
        grunt.fail.fatal('Destination must be a directory, file given:', f.dest);
      }

      f.src.forEach(function (srcFile) {
        if (!grunt.file.exists(srcFile)) {
          grunt.fail.warn('File not found:', srcFile);
          return;
        }

        if (!grunt.file.isFile(srcFile)) {
          grunt.fail.warn('Not a file:', srcFile);
          return;
        }

        if (!grunt.file.match(['*.{ttf,woff,woff2}'], srcFile)) {
          grunt.fail.warn('Not a TTF/WOFF/WOFF2 file:', srcFile);
          return;
        }

        var srcFileExt = path.extname(srcFile);
        var resultFileName = path.basename(srcFile, srcFileExt) + '.cffm';
        var resultDirname = path.normalize(f.dest);
        var resultPath = path.join(resultDirname, resultFileName);
        var font = fontkit.openSync(srcFile);
        var scaleFactor = UNITS_PER_EM / font.unitsPerEm;

        if (!font) {
          grunt.fail.fatal('Unable to read font file:', srcFile);
        }

        // Prepare glyph map
        var glyphCount = 0;
        var ignoredCharCodes = [];
        var includedCharCodes = [];
        var glyphMap = {};
        subset.forEach(function (charCode) {
          if (!font.hasGlyphForCodePoint(charCode)) {
            ignoredCharCodes.push(charCode);
            return;
          }

          includedCharCodes.push(charCode);

          var glyph = font.glyphForCodePoint(charCode);
          var glyphAdv = glyph.advanceWidth;
          var glyphPath = new SVGPath(glyph.path.toSVG())
            .scale(scaleFactor)
            .translate(0, UNITS_PER_EM)
            .round(1)
            .toString();

          var hash = md5(glyphAdv + glyphPath);
          if (glyphMap[hash]) {
            glyphMap[hash].codePoints.push(charCode);
          } else {
            glyphCount++;
            glyphMap[hash] = {
              codePoints: [charCode],
              path: glyphPath,
              advance: glyphAdv
            };
          }
        });

        if (glyphCount === 0) {
          grunt.fail.warn('Font did not have any of the selected characters:', srcFile);
          return;
        }

        grunt.file.mkdir(resultDirname);
        var oStream = fs.createWriteStream(resultPath);

        // File header
        oStream.write(CFFM_MAGIC);
        oStream.write(pack(CFFM_VERSION, 'uint16'));

        // Font header
        oStream.write(pack([
          pack(font.postscriptName),
          pack(font.copyright),
          pack(font.version),
          pack(font.ascent, 'int16'),
          pack(font.descent, 'int16'),
          pack(font.lineGap, 'int16'),
          pack(font.underlinePosition, 'int16'),
          pack(font.underlineThickness, 'int16')
        ], 'table'));

        // Glyph data array
        var glyphArrayBufs = [];
        _.each(glyphMap, function (glyphData) {
          glyphArrayBufs.push(pack([
            // Code point table
            pack(glyphData.codePoints.map(function (charCode) {
              return pack(charCode, 'uint16');
            }), 'array'),
            pack(glyphData.advance, 'uint16'),
            pack(glyphData.path)
          ], 'table'));
        });
        oStream.write(pack(glyphArrayBufs, 'array'));

        // Kerning data array
        var kerningArrayBufs = [];
        var leftStr, bufs;
        var glyphs, advances, offset;
        includedCharCodes.forEach(function (charCodeLeft) {
          leftStr = String.fromCharCode(charCodeLeft);
          bufs = [];

          includedCharCodes.forEach(function (charCodeRight) {
            glyphs = font.glyphsForString(leftStr + String.fromCharCode(charCodeRight), ['kern']);
            advances = font.advancesForGlyphs(glyphs, ['kern']);
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
        oStream.write(pack(kerningArrayBufs, 'array'));

        oStream.end();

        grunt.log.ok('Created', resultPath);
      });
    });
  });

};
