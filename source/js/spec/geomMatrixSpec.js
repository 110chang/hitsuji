/*
*
*   Spec/geom.Matrix
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/inherit',
  'mod/geom/matrix'
], function(extend, inherit, Matrix) {
  describe("Test case: geom.Matrix", function() {
    var m, n, o, p;
    var sqrt5 = Math.sqrt(5);
    var dir12 = Math.asin(2 / Math.sqrt(5)) * 180 / Math.PI;

    beforeEach(function () {
      m = new Matrix();
    });

    it('can create instance', function() {
      expect(m instanceof Matrix).toBeTruthy();
      expect(m).toEqual(Matrix([[0, 0, 0],[0, 0, 0],[0, 0, 0]]));
    });

    it('can get the value of any of the components', function() {
      expect(m.get()).toEqual(0);

      n = new Matrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
      expect(n.get(0, 0)).toEqual(1);
      expect(n.get(0, 1)).toEqual(2);
      expect(n.get(0, 2)).toEqual(3);
      expect(n.get(1, 0)).toEqual(4);
      expect(n.get(1, 1)).toEqual(5);
      expect(n.get(1, 2)).toEqual(6);
      expect(n.get(2, 0)).toEqual(7);
      expect(n.get(2, 1)).toEqual(8);
      expect(n.get(2, 2)).toEqual(9);
    });

    it('can set the value of any of the components', function() {
      m.set(1);
      m.set(2, "a", "b");//ignore non-number as zero
      expect(m.get()).toEqual(2);
      expect(m).toEqual(Matrix([[2, 0, 0],[0, 0, 0],[0, 0, 0]]));

      n = new Matrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
      n.set(9, 1, 1);
      expect(n.get(1, 1)).toEqual(9);
      expect(n).toEqual(Matrix([[1, 2, 3], [4, 9, 6], [7, 8, 9]]));
    });

    it('can compare with an other matrix', function() {
      n = new Matrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);

      expect(m.isEqual(n)).toBeFalsy();
      m = new Matrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
      expect(m.isEqual(n)).toBeTruthy();

      o = new Matrix([[1, 2, 3], [4, 5, 6]]);
      p = new Matrix([[1, 2], [3, 4], [5, 6]]);
      expect(o.isEqual(p)).toBeFalsy();
    });

    it('knows myself square matrix', function() {
      expect(m.isSquare()).toBeTruthy();
      
      n = new Matrix([[1, 2, 3], [4, 5, 6]]);
      expect(n.isSquare()).toBeFalsy();
    });

    it('knows myself same as an another matrix', function() {
      n = new Matrix([[1, 2, 3], [4, 5, 6]]);
      expect(m.isSameTypeAs(n)).toBeFalsy();
      
      n = new Matrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
      expect(n.isSameTypeAs(n)).toBeTruthy();
    });

    it('can sum matrix', function() {
      m = new Matrix([[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
      n = new Matrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
      expect(m.sum(n)).toEqual(Matrix([[2, 3, 4], [5, 6, 7], [8, 9, 10]]));
      m.sum(n, true);//destruct
      expect(m).toEqual(Matrix([[2, 3, 4], [5, 6, 7], [8, 9, 10]]));
    });

    it('can subtract matrix', function() {
      m = new Matrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
      n = new Matrix([[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
      expect(m.sub(n)).toEqual(Matrix([[0, 1, 2], [3, 4, 5], [6, 7, 8]]));
      m.sub(n, true);//destruct
      expect(m).toEqual(Matrix([[0, 1, 2], [3, 4, 5], [6, 7, 8]]));
    });

    it('can scalar multiply matrix', function() {
      m = new Matrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
      expect(m.scalarMultiply(10)).toEqual(Matrix([[10, 20, 30], [40, 50, 60], [70, 80, 90]]));
    });

    it('can multiply matrix', function() {
      m = new Matrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
      n = new Matrix([1, 1, 0]);
      expect(m.multiply(n)).toEqual(Matrix([[3], [9], [15]]));
    });

    it('can transpose matrix', function() {
      m = new Matrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
      expect(m.transpose()).toEqual(Matrix([[1, 4, 7], [2, 5, 8], [3, 6, 9]]));
    });

    it('to string representation', function() {
      m = new Matrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
      expect(m.toString()).toEqual('[ 1, 2, 3 ]\n[ 4, 5, 6 ]\n[ 7, 8, 9 ]\n');
    });

    it('can create zero matrix', function() {
      var zero3x3 = Matrix.zeroMatrix(3, 3);
      expect(zero3x3).toEqual(Matrix([[0, 0, 0],[0, 0, 0],[0, 0, 0]]));
      
      var zero2x2 = Matrix.zeroMatrix(2, 2);
      expect(zero2x2).toEqual(Matrix([[0, 0],[0, 0]]));
    });

  });
});