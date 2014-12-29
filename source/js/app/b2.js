/*
*
*   b2 - Box2dWeb wrapper
*
*   @author Yuji Ito @110chang
*
*/

define([
  'box2d'
], function() {
  return {
    Vec2          : Box2D.Common.Math.b2Vec2,
    AABB          : Box2D.Collision.b2AABB,
    BodyDef       : Box2D.Dynamics.b2BodyDef,
    Body          : Box2D.Dynamics.b2Body,
    FixtureDef    : Box2D.Dynamics.b2FixtureDef,
    Fixture       : Box2D.Dynamics.b2Fixture,
    World         : Box2D.Dynamics.b2World,
    MassData      : Box2D.Collision.Shapes.b2MassData,
    PolygonShape  : Box2D.Collision.Shapes.b2PolygonShape,
    CircleShape   : Box2D.Collision.Shapes.b2CircleShape,
    DebugDraw     : Box2D.Dynamics.b2DebugDraw,
    MouseJointDef : Box2D.Dynamics.Joints.b2MouseJointDef
  };
});
