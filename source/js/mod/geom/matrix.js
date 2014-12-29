/*
*
*   geom.Matrix r2
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/like'
], function(extend, like) {
  if (Array.isArray == null) {
    Array.isArray = function(array) {
      return Object.prototype.toString.call(array) === '[object Array]';
    };
  }
  function zeroMatrix(c, r) {
    var i = 0, j = 0, m = [];

    c = c == null ? 3 : ~~c;
    r = r == null ? 3 : ~~r;

    for (; i < c; i++) {
      m[i] = [];
      for (j = 0; j < r; j++) {
        m[i][j] = 0;
      }
    }
    return new Matrix(m);
  }

  function Matrix(array) {
    if (array == null) {
      array = zeroMatrix(3, 3).structure;
    } else if (!Array.isArray(array)) {
      throw new Error('Arguments must be Array.');
    }
    if (!(this instanceof Matrix)) {
      return new Matrix(array);
    }
    //1次元配列は1xN行列とする
    if (typeof array[0] === 'number') {
      var a = [], i = 0;
      for (; i < array.length; i++) {
        a[i] = [array[i]];
      }
      array = a;
    }
    this.structure = array;
  }
  extend(Matrix.prototype, {
    structure: null,
    get: function(i, j) {
      i = i == null ? 0 : ~~i;
      j = j == null ? 0 : ~~j;
      return this.structure[i][j];
    },
    set: function(value, i, j) {
      if (typeof value !== 'number') {
        throw new Error('Invalid arguments.');
      }
      i = i == null ? 0 : ~~i;
      j = j == null ? 0 : ~~j;
      
      this.structure[i][j] = value;

      return value;
    },
    isEqual: function(matrix) {
      if (!like(matrix, Matrix.prototype)){
        throw new Error('Arguments must be Matrix');
      }
      if (!this.isSameTypeAs(matrix)) {
        return false;
      }
      var s0 = this.structure;
      var s1 = matrix.structure;
      var i, j;

      for (i = 0; i < s0.length; i++) {
        for (j = 0; j < s0[i].length; j++){
          if (s0[i][j] !== s1[i][j]) {
            return false;
          }
        }
      }
      return true;
    },
    isSquare: function() {
      return this.structure.length === this.structure[0].length;
    },
    isSameTypeAs: function(matrix) {
      if (!like(matrix, Matrix.prototype)){
        throw new Error('Arguments must be Matrix');
      }
      var s0 = this.structure;
      var s1 = matrix.structure;

      return s0.length === s1.length && s0[0].length === s1[0].length;
    },
    sum: function(matrix, destructive) {
      if (!like(matrix, Matrix.prototype)){
        throw new Error('Arguments must be Matrix');
      }
      if (!this.isSameTypeAs(matrix)) {
        throw new Error('Type of matrix is different.');
      }
      var r  = [];
      var s0 = this.structure;
      var s1 = matrix.structure;
      var d  = destructive || false;
      var i, j;

      for (i = 0; i < s0.length; i++) {
        r[i] = [];
        
        for (j = 0; j < s0[i].length; j++) {
          r[i][j] = s0[i][j] + s1[i][j];
        }
      }
      if (d) {
        this.structure = r;
        return this;
      } else {
        return new Matrix(r);
      }
    },
    sub: function(matrix, destructive){
      if (!like(matrix, Matrix.prototype)){
        throw new Error('Arguments must be Matrix');
      }
      if (!this.isSameTypeAs(matrix)) {
        throw new Error('Type of matrix is different.');
      }
      var r  = [];
      var s0 = this.structure;
      var s1 = matrix.structure;
      var d  = destructive || false;
      var i, j;

      for (i = 0; i < s0.length; i++) {
        r[i] = [];
        
        for (j = 0; j < s0[i].length; j++) {
          r[i][j] = s0[i][j] - s1[i][j];
        }
      }
      if (d) {
        this.structure = r;
        return this;
      } else {
        return new Matrix(r);
      }
    },
    scalarMultiply: function(num){
      if (typeof num !== 'number'){
        throw new Error('Arguments must be Number');
      }
      var r = [];
      var s = this.structure;
      var i, j;
      
      for (i = 0; i < s.length; i++) {
        r[i] = [];
        
        for (j = 0; j < s[i].length; j++) {
          r[i][j] = s[i][j] * num;
        }
      }
      return new Matrix(r);
    },
    multiply: function(matrix, destructive){
      if (!like(matrix, Matrix.prototype)){
        throw new Error('Arguments must be Matrix');
      }
      var r  = [];
      var s0 = this.structure;
      var s1 = matrix.structure;
      var d  = destructive || false;
      var i, j, k, ik, kj, iMax, jMax, kMax;//, rijStr;
      
      if (s0[0].length !== s1.length) {
        throw new Error('Can not define a matrix product');
      }
      iMax = s0.length;
      jMax = s1[0].length;
      kMax = iMax > jMax ? iMax : jMax;
      
      for (i = 0; i < iMax; i++) {
        r[i] = [];
        
        for (j = 0; j < jMax; j++) {
          if (r[i][j] == null) {
            r[i][j] = 0;
          }
          for (k = 0; k < kMax; k++) {
            ik = s0[i][k];
            kj = s1[k][j];
            
            if (ik == null || kj == null) {
              continue;
            }
            r[i][j] += ik * kj;
            //rijStr += 'a[' + i + '' + k + '] b[' + k + '' + j + '] + ';
          }
        }
      }
      if (d) {
        this.structure = r;
        return this;
      } else {
        return new Matrix(r);
      }
    },
    transpose: function(destructive){
      var r = [];
      var s = this.structure;
      var d = destructive || false;
      var i, j;
      
      for (i = 0; i < s[0].length; i++) {
        r[i] = [];
        for (j = 0; j < s.length; j++){
          r[i][j] = s[j][i];
        }
      }
      if (d) {
        this.structure = r;
        return this;
      } else {
        return new Matrix(r);
      }
    },
    invert: function(matrix) {
      if (!like(matrix, Matrix.prototype)){
        throw new Error('arguments must be Matrix');
      }
      // To Do
    },
    toString: function() {
      var str = '';
      var s   = this.structure;
      var i, j;
      
      for (i = 0; i < s.length; i++) {
        str += '[ ';
        for (j = 0; j < s[i].length; j++) {
          str += s[i][j];
          if (j < s[i].length - 1) {
            str += ', ';
          }
        }
        str += ' ]\n';
      }
      return str;
    }
  });

  Matrix.zeroMatrix = zeroMatrix;
  
  return Matrix;
});
