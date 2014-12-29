/*
*
*   Spec/Nav.Anchor
*
*   @author Yuji Ito @110chang
*
*/

define([
  'jquery',
  'mod/extend',
  'mod/nav/anchor'
], function($, extend, Anchor) {
  describe("Test case: Anchor", function() {
    var $body, $fix, $a1, $a2, $a3, $a4, $a5, handler;
    console.log(jasmine.getFixtures);
    jasmine.getFixtures().fixturesPath = 'source/fixtures';

    beforeEach(function() {
      loadFixtures('nav/anchor.html');
      //loadStyleFixtures('nav/anchor.css');
      originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 50000;

      $win = $(window);
      $body = $('body');
      $fix = $('#fx-wrapper');
      //console.log($fix);
      $body.append($fix);
      $a1 = $('a[href="#s1"]');
      $a2 = $('a[href="#s2"]');
      $a3 = $('a[href="#s3"]');
      $a4 = $('a[href="#s4"]');
      $a5 = $('a[href="#s5"]');
      $.fx.off = true;

      (Anchor()).initialize();
    });

    afterEach(function() {
      $body.remove('#fx-wrapper');
      //console.log($body.children().size())
    });

    it('is singleton', function() {
      var a = Anchor();
      var b = new Anchor();
      expect(a).toBe(b);
      a.initialize({duration: 500});
      b.initialize({duration: 1000});
      expect(a.conf.duration).toBe(b.conf.duration);
    });

    it('can add animation to anchor links', function(done) {
      var animFin = spyOnEvent(window, 'anchorAnimationFinish');
      var a1Clicked = spyOnEvent('a[href="#s1"]', 'click');

      expect(animFin).not.toHaveBeenTriggered();
      $win.on('anchorAnimationFinish', function() {
        //console.log('animation finish');
        expect(animFin).toHaveBeenTriggered();
        done();
      });
      expect(a1Clicked).not.toHaveBeenTriggered();
      $a1.trigger('click');
      expect(a1Clicked).toHaveBeenTriggered();
    });

  }); 
});