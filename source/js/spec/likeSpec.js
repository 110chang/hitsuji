/*
*
*   Spec/Like
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/inherit',
  'mod/dump',
  'mod/like'
], function(extend, inherit, dump, like) {
  describe("Test case: Like", function() {
    var Person, SuperPerson, Hentai, Newtype;

    beforeEach(function () {
      Person = function(name) {
        this.name = name;
      };
      extend(Person.prototype, {
        name: null,
        attack: function() {
          //console.log('attack: 200 damage');
          return 200;
        },
        defence: function() {
          //console.log('defence: 150 damage');
          return 150;
        }
      });

      SuperPerson = function(name) {
        Person.call(this, name);
      };
      extend(SuperPerson.prototype, Person.prototype, {
        attack: function() {
          //console.log('attack 300 damage');
          return Person.prototype.attack.call(this) + 300;
        },
        magic: function() {
          return 'magic';
        }
      });

      Hentai = function(type) {
        this.type = type;
      }
      extend(Hentai.prototype, {
        peropero: function() {
          return 'peropero';
        }
      });
    });

    it('can ducktype object.', function() {
      var a = new Person('John');
      var b = new SuperPerson('Taro');
      var c = new Hentai('Hoge');
      expect(like(b, a)).toBeTruthy();
      expect(like(SuperPerson.prototype, Person.prototype)).toBeTruthy();
      expect(like(b, SuperPerson.prototype)).toBeTruthy();
      expect(like(c, a)).toBeFalsy();
      expect(like(Hentai.prototype, Person.prototype)).toBeFalsy();
      expect(like(c, Hentai.prototype)).toBeTruthy();
    });

  }); 
});