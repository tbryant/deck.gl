// Copyright (c) 2015 Uber Technologies, Inc.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import Controller from './controller';
import OrbitViewport from '../viewports/orbit-viewport';
import {Vector3} from 'math.gl';
import vec3_add from 'gl-vec3/add';
import vec3_scale from 'gl-vec3/scale';
import vec3_lerp from 'gl-vec3/lerp';
import assert from 'assert';

const defaultState = {
  lookAt: [0, 0, 0],
  pitchAngle: 0,
  orbitAngle: 0,
  fov: 50,
  near: 1,
  far: 100,
  translationX: 0,
  translationY: 0,
  zoom: 1
};

const defaultConstraints = {
  minZoom: 0,
  maxZoom: Infinity
};

/*
export default class OrbitState {

  constructor({
    // Viewport arguments
    width, // Width of viewport
    height, // Height of viewport
    distance, // From eye to target
    pitchAngle, // Rotation around x axis
    orbitAngle, // Rotation around orbit axis

    // Bounding box of the model, in the shape of {minX, maxX, minY, maxY, minZ, maxZ}
    bounds,

    // View matrix arguments
    lookAt, // Which point is camera looking at, default origin

    // Projection matrix arguments
    fov, // Field of view covered by camera
    near, // Distance of near clipping plane
    far, // Distance of far clipping plane

    // After projection
    translationX, // in pixels
    translationY, // in pixels
    zoom,

    // Viewport constraints
    minZoom,
    maxZoom,

    // Interaction states, required to calculate change during transform
    // Model state when the pan operation first started
    startPanPos,
    startPanTranslation,
    // Model state when the rotate operation first started
    startRotateCenter,
    startRotateViewport,
    // Model state when the zoom operation first started
    startZoomPos,
    startZoom
  }) {
    assert(Number.isFinite(width), '`width` must be supplied');
    assert(Number.isFinite(height), '`height` must be supplied');
    assert(Number.isFinite(distance), '`distance` must be supplied');

    this._viewportProps = this._applyConstraints({
      width,
      height,
      distance,
      pitchAngle: ensureFinite(pitchAngle, defaultState.pitchAngle),
      orbitAngle: ensureFinite(orbitAngle, defaultState.orbitAngle),

      bounds,
      lookAt: lookAt || defaultState.lookAt,

      fov: ensureFinite(fov, defaultState.fov),
      near: ensureFinite(near, defaultState.near),
      far: ensureFinite(far, defaultState.far),
      translationX: ensureFinite(translationX, defaultState.translationX),
      translationY: ensureFinite(translationY, defaultState.translationY),
      zoom: ensureFinite(zoom, defaultState.zoom),

      minZoom: ensureFinite(minZoom, defaultConstraints.minZoom),
      maxZoom: ensureFinite(maxZoom, defaultConstraints.maxZoom)
    });
  }
*/

/* Helpers */

// Whether number is between bounds
function inRange(x, min, max) {
  return x >= min && x <= max;
}
// Constrain number between bounds
function clamp(x, min, max) {
  return x < min ? min : (x > max ? max : x);
}
// Get ratio of x on domain
function interpolate(x, domain0, domain1) {
  if (domain0 === domain1) {
    return x === domain0 ? 0 : Infinity;
  }
  return (x - domain0) / (domain1 - domain0);
}

function ensureFinite(value, fallbackValue) {
  return Number.isFinite(value) ? value : fallbackValue;
}

/* Private methods */

// Apply any constraints (mathematical or defined by _viewportProps) to map state
function _applyConstraints(props) {
  // Ensure zoom is within specified range
  const {maxZoom, minZoom, zoom} = props;
  props.zoom = zoom > maxZoom ? maxZoom : zoom;
  props.zoom = zoom < minZoom ? minZoom : zoom;

  return props;
}

/* Cast a ray into the screen center and take the average of all
 * intersections with the bounding box:
 *
 *                         (x=w/2)
 *                          .
 *                          .
 *   (bounding box)         .
 *           _-------------_.
 *          | "-_           :-_
 *         |     "-_        .  "-_
 *        |         "-------+-----:
 *       |.........|........C....|............. (y=h/2)
 *      |         |         .   |
 *     |         |          .  |
 *    |         |           . |
 *   |         |            .|
 *  |         |             |                      Y
 *   "-_     |             |.             Z       |
 *      "-_ |             | .              "-_   |
 *         "-------------"                    "-|_____ X
 */
function _getLocationAtCenter({width, height, bounds}) {
  if (!bounds) {
    return null;
  }

  const viewport = new OrbitViewport(this._viewportProps);

  const C0 = viewport.unproject([width / 2, height / 2, 0]);
  const C1 = viewport.unproject([width / 2, height / 2, 1]);
  const sum = [0, 0, 0];
  let count = 0;

  [
    // depth at intersection with X = minX
    interpolate(bounds.minX, C0[0], C1[0]),
    // depth at intersection with X = maxX
    interpolate(bounds.maxX, C0[0], C1[0]),
    // depth at intersection with Y = minY
    interpolate(bounds.minY, C0[1], C1[1]),
    // depth at intersection with Y = maxY
    interpolate(bounds.maxY, C0[1], C1[1]),
    // depth at intersection with Z = minZ
    interpolate(bounds.minZ, C0[2], C1[2]),
    // depth at intersection with Z = maxZ
    interpolate(bounds.maxZ, C0[2], C1[2])
  ].forEach(d => {
    // worldspace position of the intersection
    const C = vec3_lerp([], C0, C1, d);
    // check if position is on the bounding box
    if (inRange(C[0], bounds.minX, bounds.maxX) &&
        inRange(C[1], bounds.minY, bounds.maxY) &&
        inRange(C[2], bounds.minZ, bounds.maxZ)) {
      count++;
      vec3_add(sum, sum, C);
    }
  });

  return count > 0 ? vec3_scale([], sum, 1 / count) : null;
}

// Event reducers

// Start panning
// @param {[Number, Number]} pos - position on screen where the pointer grabs
// panStart({pos}) {
//   const {translationX, translationY} = this._viewportProps;
//   return viewState.getUpdatedState({
//     startPanPosition: [translationX, translationY],
//     startPanEventPosition: pos
//   });
// }

// Pan
// @param {[Number, Number]} pos - position on screen where the pointer is
function pan(viewState, controller, {pos, startPos}) {
  const startPanEventPosition = controller.state.startPanEventPosition || startPos;
  assert(startPanEventPosition, '`startPanEventPosition` props is required');

  let [translationX, translationY] = controller.state.startPanPosition || [];
  translationX = ensureFinite(translationX, this._viewportProps.translationX);
  translationY = ensureFinite(translationY, this._viewportProps.translationY);

  const deltaX = pos[0] - startPanEventPosition[0];
  const deltaY = pos[1] - startPanEventPosition[1];

  return viewState.getUpdatedState({
    translationX: translationX + deltaX,
    translationY: translationY - deltaY
  });
}


/**
 * Start panning
 * @param {[Number, Number]} pos - position on screen where the pointer grabs
 */
function panStart(viewState, controller, {pos}) {
  const {translationX, translationY} = this._viewportProps;

  return viewState.getUpdateState({
    startPanTranslation: [translationX, translationY],
    startPanPos: pos
  });
}

/**
 * Pan
 * @param {[Number, Number]} pos - position on screen where the pointer is
 */
function pan(viewState, controller, {pos, startPos}) {
  const startPanPos = this._interactiveState.startPanPos || startPos;
  assert(startPanPos, '`startPanPos` props is required');

  let [translationX, translationY] = this._interactiveState.startPanTranslation || [];
  translationX = ensureFinite(translationX, this._viewportProps.translationX);
  translationY = ensureFinite(translationY, this._viewportProps.translationY);

  const deltaX = pos[0] - startPanPos[0];
  const deltaY = pos[1] - startPanPos[1];

  return viewState.getUpdateState({
    translationX: translationX + deltaX,
    translationY: translationY - deltaY
  });
}

/**
 * End panning
 * Must call if `panStart()` was called
 */
function panEnd(viewState, controller) {
  return viewState.getUpdateState({
    startPanTranslation: null,
    startPanPos: null
  });
}

/**
 * Start rotating
 * @param {[Number, Number]} pos - position on screen where the pointer grabs
 */
function rotateStart(viewState, controller, {pos}) {
  // Rotation center should be the worldspace position at the center of the
  // the screen. If not found, use the last one.
  const startRotateCenter = this._getLocationAtCenter() ||
    this._interactiveState.startRotateCenter;

  return viewState.getUpdateState({
    startRotateCenter,
    startRotateViewport: this._viewportProps
  });
}

/**
 * Rotate
 * @param {[Number, Number]} pos - position on screen where the pointer is
 */
function rotate(viewState, controller, {deltaScaleX, deltaScaleY}) {
  const {startRotateCenter, startRotateViewport} = this._interactiveState;

  let {pitchAngle, orbitAngle, translationX, translationY} = startRotateViewport || {};
  pitchAngle = ensureFinite(pitchAngle, this._viewportProps.pitchAngle);
  orbitAngle = ensureFinite(orbitAngle, this._viewportProps.orbitAngle);
  translationX = ensureFinite(translationX, this._viewportProps.translationX);
  translationY = ensureFinite(translationY, this._viewportProps.translationY);

  const newPitchAngle = clamp(pitchAngle - deltaScaleY * 180, -89.999, 89.999);
  const newOrbitAngle = (orbitAngle - deltaScaleX * 180) % 360;

  let newTranslationX = translationX;
  let newTranslationY = translationY;

  if (startRotateCenter) {
    // Keep rotation center at the center of the screen
    const oldViewport = new OrbitViewport(startRotateViewport);
    const oldCenterPos = oldViewport.project(startRotateCenter);

    const newViewport = new OrbitViewport(Object.assign({}, startRotateViewport, {
      pitchAngle: newPitchAngle,
      orbitAngle: newOrbitAngle
    }));
    const newCenterPos = newViewport.project(startRotateCenter);

    newTranslationX += oldCenterPos[0] - newCenterPos[0];
    newTranslationY -= oldCenterPos[1] - newCenterPos[1];
  }

  return viewState.getUpdateState({
    pitchAngle: newPitchAngle,
    orbitAngle: newOrbitAngle,
    translationX: newTranslationX,
    translationY: newTranslationY
  });
}

/**
 * End rotating
 * Must call if `rotateStart()` was called
 */
function rotateEnd(viewState, controller) {
  return viewState.getUpdateState({
    startRotateCenter: null,
    startRotateViewport: null
  });
}

/**
 * Start zooming
 * @param {[Number, Number]} pos - position on screen where the pointer grabs
 */
function zoomStart(viewState, controller, {pos}) {
  return viewState.getUpdateState({
    startZoomPos: pos,
    startZoom: this._viewportProps.zoom
  });
}

/**
 * Zoom
 * @param {[Number, Number]} pos - position on screen where the current center is
 * @param {[Number, Number]} startPos - the center position at
 *   the start of the operation. Must be supplied of `zoomStart()` was not called
 * @param {Number} scale - a number between [0, 1] specifying the accumulated
 *   relative scale.
 */
function zoom(viewState, controller, {pos, startPos, scale}) {
  const {zoom, minZoom, maxZoom, width, height, translationX, translationY} =
    this._viewportProps;

  const startZoomPos = this._interactiveState.startZoomPos || startPos || pos;

  const newZoom = clamp(zoom * scale, minZoom, maxZoom);
  const deltaX = pos[0] - startZoomPos[0];
  const deltaY = pos[1] - startZoomPos[1];

  // Zoom around the center position
  const cx = startZoomPos[0] - width / 2;
  const cy = height / 2 - startZoomPos[1];
  const newTranslationX = cx - (cx - translationX) * newZoom / zoom + deltaX;
  const newTranslationY = cy - (cy - translationY) * newZoom / zoom - deltaY;

  return viewState.getUpdateState({
    zoom: newZoom,
    translationX: newTranslationX,
    translationY: newTranslationY
  });
}

/**
 * End zooming
 * Must call if `zoomStart()` was called
 */
function zoomEnd(viewState, controller) {
  return viewState.getUpdateState({
    startZoomPos: null,
    startZoom: null
  });
}

export const EVENT_REDUCERS = {
  // panStart,
  pan,
  // panEnd,
  // rotateStart,
  rotate,
  // rotateEnd,
  zoomStart,
  zoom,
  zoomEnd
  // zoomIn,
  // zoomOut,
  // moveUp,
  // moveDown,
  // moveLeft,
  // moveRight,
  // moveForward,
  // moveBackward
};

// A class that handles events based on an "orbit" interaction model
export default class OrbitController extends Controller {
  constructor(options) {
    // Register map specific "ViewState + event -> ViewState" reducers
    super(Object.assign({}, options, {reducers: EVENT_REDUCERS}));
  }
}
