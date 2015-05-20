# grunt-font2sff

> Convert fonts to simple font file format

A Grunt task to convert OTF/TTF/WOFF/WOFF2 font files to SFF (Simple Font File Format). SFF is a special-purpose binary font format that includes just a subset of what Truetype/OpenType offer, but allows simple and fast parsing, suitable for the Browser.

It's primary purpose is typesetting using SVG paths, which often gives better visual results than conventional `<text>` setting in some Browsers. (\*ahem\* Firefox \*ahem\*)

SFF files can be parsed with [sff-svg](https://git.fapprik.com/fza/sff-svg), which also provides an API for typesetting in an SVG context.

A SFF file includes the same general font metrics than the original font file with glyphs as SVG paths and a kerning table. Ligatures and other font features are not included. SFF files are not compressed and this is in purpose as SFF files are meant to be included via [brfs](https://www.npmjs.com/package/brfs) in a browserify bundle, which is then minified and gzipped.

## Getting Started

This plugin requires Grunt `~0.4.5`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install grunt-font2sff --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks('grunt-font2sff');
```

## The "font2sff" task

In your project's Gruntfile, add a section named "font2sff" to the data object passed into `grunt.initConfig()`:

```js
grunt.initConfig({
  font2sff: {
    helvetica: {
      options: {
        charsets: ['english']
      },
      src: ['./Helvetica.ttf'],
      dest: './output-folder'
    }
  }
});
```

### Options

#### options.charsets

Type: `Array`  
Default value: `['english']`

The character subset. Can be a list of `[123]` array-wrapped char codes, `[123, 127]` char codes ranges, named charsets, or any combination of these formats.

The named charsets are: `basicLatin`, `latinSupplement`, `extendedLatinA`, `extendedLatinB`, `ipaExtension`, `greek`, `phonetic`, `punctuation`, `currencySymbols`, `mathSymbols`, `latinLowercase`, `latinUppercase`, `extendedSymbols`.

There are convenience charsets as well: `english`, `german`, `westernEuropean`.

Please see the source code for the actual unicode ranges behind these named charset. A unicode table might be of great use, too.

#### options.excludeCharsets

Type: `Array`  
Default value: `undefined`

Same format as `options.charsets`. Use this to exclude certain characters or character ranges.

#### options.includeCharsets

Type: `Array`  
Default value: `undefined`

Same format as `options.charsets`. Use this to re-include certain characters that have been excluded by a charset range.

### Usage Examples

#### Default options

```js
grunt.initConfig({
  font2sff: {
    options: {
      charset: ['english'],
      excludeCharsets: undefined,
      includeCharsets: undefined
    }
  }
});
```

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).

## Release History

* 0.1.0 - Initial release

## License

Copyright (c) 2015 [Felix Zandanel](http://felix.zandanel.me)  
Licensed under the MIT license.

See LICENSE for more info.
