'use strict';

var _ = require('lodash');

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

module.exports = function (charsets, includeCharsets, excludeCharsets) {
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

    if (!_.isArray(charsetList)) {
      charsetList = [charsetList];
    }

    if (_.isNumber(charsetList[0])) {
      charCodeList = charCodeList.concat(numberOrRange(charsetList));
    } else {
      charsetList.forEach(function (charset) {
        var list;

        if (_.isString(charset)) {
          if (!unicodeRanges[charset]) {
            throw new Error('Charset not defined: ' + charset);
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
};
