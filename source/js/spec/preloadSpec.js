/*
*
*   Spec/Preload
*
*   @author Yuji Ito @110chang
*
*/

define([
  'jquery',
  'mod/extend',
  'mod/preload'
], function($, extend, Preload) {
  describe("Test case: Preload", function() {
    var preloader;
    var $body;

    jasmine.getFixtures().fixturesPath = 'source/fixtures';

    beforeEach(function() {
      $body = $('body');

      loadFixtures('preload.html');

      originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 9999999;

      preloader = Preload();
    });

    afterEach(function() {
      $body.remove('#fx-wrapper');
    });

    it('is singleton', function() {
      var b = new Preload('hoge');
      expect(preloader.$imgs.selector).toEqual('img');
      expect(preloader).toBe(b);
    });

    it('can notify all images load complete.', function(done) {
      preloader.subscribe(Preload.PRELOAD_INTERVAL, function(e, data) {
        //console.log(data.loaded);
      });
      preloader.subscribe(Preload.PRELOAD_FINISH, function(e, data) {
        expect(data.loaded).toEqual(100);
        done();
      });
      preloader.exec();
    });

  }); 
});