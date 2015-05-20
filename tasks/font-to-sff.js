'use strict';

var path = require('path');
var async = require('async');
var createUnicodeSubset = require('../lib/unicode-subset');
var SffConverter = require('../lib/sff-converter');

module.exports = function (grunt) {

  grunt.registerMultiTask('font2sff', 'Convert fonts to simple font file format', function () {
    var done = this.async();

    var opts = this.options({
      charsets: ['english'],
      excludeCharsets: undefined,
      includeCharsets: undefined
    });

    var subset;
    try {
      subset = createUnicodeSubset(opts.charsets, opts.excludeCharsets, opts.includeCharsets);
    } catch (e) {
      grunt.fail.fatal(e.message);
    }

    if (subset.length === 0) {
      grunt.fail.fatal('Selected character subset contains no characters.');
    }

    async.each(this.files, function (file, done1) {
      if (grunt.file.exists(file.dest) && grunt.file.isFile(file.dest)) {
        grunt.fail.fatal('Destination must be a directory, file given:', file.dest);
      }

      async.each(file.src, function (srcFile, done2) {
        if (!grunt.file.exists(srcFile)) {
          grunt.fail.warn('File not found:', srcFile);
          done2();
        }

        if (!grunt.file.isFile(srcFile)) {
          grunt.fail.warn('Not a file:', srcFile);
          done2();
        }

        if (!grunt.file.match(['*.{otf,ttf,woff,woff2}'], srcFile)) {
          grunt.fail.warn('Not an OTF/TTF/WOFF/WOFF2 file:', srcFile);
          done2();
        }

        var srcFileExt = path.extname(srcFile);
        var resultFileName = path.basename(srcFile, srcFileExt) + '.sff';
        var resultDirname = path.normalize(file.dest);
        var destFile = path.join(resultDirname, resultFileName);

        grunt.file.mkdir(resultDirname);

        var converter = new SffConverter(subset);
        converter.once('finish', function () {
          grunt.log.ok('Created file ' + destFile);
          done2();
        });
        converter.once('error', done2);
        converter.convert(srcFile, destFile);
      }, done1);
    }, function (err) {
      if (err) {
        grunt.fail.fatal(err.message);
      }

      done();
    });

  });

};
