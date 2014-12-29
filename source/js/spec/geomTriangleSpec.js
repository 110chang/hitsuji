/*
*
*   Spec/geom.Triangle
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/geom/point',
  'mod/geom/triangle'
], function(extend, Point, Triangle) {
  describe("Test case: geom.Triangle", function() {
    var t, P, Q, R;

    beforeEach(function () {
      P = new Point(10, 10);
      Q = new Point(20, 20);
      R = new Point(30, 10);
      S = new Point(20, -20);
    });

    it('can create instance.', function() {
      t = new Triangle(P, Q, R);
      expect(t instanceof Triangle).toBeTruthy();

      t = Triangle(P, Q, R);
      expect(t instanceof Triangle).toBeTruthy();
      expect(t.start).toEqual(P);
      expect(t.middle).toEqual(Q);
      expect(t.end).toEqual(R);
    });

    it('can knows own area.', function() {
      t = new Triangle(P, Q, R);
      expect(t.getArea(false)).toEqual(20 * 10 / 2);
    });

    it('can knows own gravity center.', function() {
      t = new Triangle(P, Q, R);
      expect(t.getGravityCenter()).toEqual(
        Point((P.x + Q.x + R.x) / 3, (P.y + Q.y + R.y) / 3)
      );
    });

    it('can knows own circum center.', function() {
      t = new Triangle(P, Q, R);
      expect(t.getCircumCenter()).toEqual(Point(20, 10));
    });

    it('can translate coords.', function() {
      t = new Triangle(P, Q, R);
      t.translate(10, 10);
      expect(t.start).toEqual(P.translate(10, 10));
      expect(t.middle).toEqual(Q.translate(10, 10));
      expect(t.end).toEqual(R.translate(10, 10));
    });

    it('can knows contain some point in itself.', function() {
      t = new Triangle(P, Q, R);
      expect(t.contain(Point(15, 15))).toBeTruthy();
      expect(t.contain(Point(100, 0))).toBeFalsy();
    });
  });
});