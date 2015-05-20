'use strict';

// Right 4 bits of control byte is the value type
var mods = {
  uint8: 1, int8: 2,
  uint16: 3, int16: 4,
  uint32: 5, int32: 6,
  float32: 7
};

// Left 4 bits of the control byte is the control command
var ctrl = {
  A: 1, C: 2,
  H: 3, L: 4,
  M: 5, Q: 6,
  S: 7, T: 8,
  V: 9, Z: 10,
  ' ': 14
};

var END_BYTE = 0xf0;

var controlRegExp = /^[ ACHLMQSTVZ]/;
var numericRegExp = /^(-)?(\d+(\.\d+)?)/;

function getValType(val) {
  var int = parseInt(val, 10);

  if (val !== int) {
    return 'float32';
  }

  var unsigned = false;
  var type = '';

  if (val >= 0) {
    unsigned = true;
    type += 'u';
  }

  type += 'int';

  var factor = unsigned ? 2 : 1;
  var absVal = Math.abs(val);
  if (absVal < 128 * factor) {
    type += '8';
  } else if (absVal < 32768 * factor) {
    type += '16';
  } else {
    type += '32';
  }

  return type;
}

module.exports = function compressPath(str) {
  var buf = new Buffer(str.length * 2);
  var bufOffset = 0;
  var strOffset = 0;
  var char, valType;
  var curCmd = null, curVal = null;

  function writeByte(byte) {
    buf.writeUInt8(byte, bufOffset++);
  }

  function writeCurVal(type) {
    switch (type) {
      case 'uint8':
        buf.writeUInt8(curVal, bufOffset++);
        break;

      case 'int8':
        buf.writeInt8(curVal, bufOffset++);
        break;

      case 'uint16':
        buf.writeUInt16BE(curVal, bufOffset);
        bufOffset += 2;
        break;

      case 'int16':
        buf.writeInt16BE(curVal, bufOffset);
        bufOffset += 2;
        break;

      case 'uint32':
        buf.writeUInt32BE(curVal, bufOffset);
        bufOffset += 4;
        break;

      case 'int32':
        buf.writeInt32BE(curVal, bufOffset);
        bufOffset += 4;
        break;

      case 'float32':
        buf.writeFloatBE(curVal, bufOffset);
        bufOffset += 4;
        break;
    }

    curVal = null;
  }

  function writeCurCmd() {
    if (curCmd !== null) {
      writeByte(curCmd);
      curCmd = null;
    }
  }

  for (; strOffset < str.length; strOffset++) {
    char = str[strOffset];
    if (controlRegExp.test(char)) {
      writeCurCmd();
      curCmd = ctrl[char] << 4;
      continue;
    } else {
      var match = str.substr(strOffset, 16).match(numericRegExp);
      if (match) {
        strOffset += match[0].length - 1;
        curVal = parseFloat(match[2]) * (match[1] ? -1 : 1);
        valType = getValType(curVal);

        if (curCmd === null) {
          curCmd = 0;
        }

        curCmd |= mods[valType];
        writeCurCmd();
        writeCurVal(valType);
        continue;
      }
    }

    throw new Error('Could not parse SVG path');
  }

  writeCurCmd();
  writeByte(END_BYTE);

  return buf.slice(0, bufOffset);
};
