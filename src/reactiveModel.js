import Graph from "./graph";
import ReactiveFunction from "./reactiveFunction";
import SimpleModel from "./simpleModel";
import makeNode from "./makeNode";
import debounce from "./debounce";
import nextFrame from "./nextFrame";

var dependencyGraph = new Graph();

function ReactiveModel(){

  // Enforce use of new.
  // See http://stackoverflow.com/questions/17032749/pattern-for-enforcing-new-in-javascript
  if (!(this instanceof ReactiveModel)) {
    return new ReactiveModel();
  }

  // Refer to `this` (the ReactiveModel instance) as `model` in this closure.
  var model = this;

  // This object tracks the state of tracked properties.
  var simpleModel = new SimpleModel();

  // The set of tracked properties. { property -> true }
  var trackedProperties = {};

  // The set of changed properties. { property -> true }
  var changedProperties = {};
    
  // Keys are property names,
  // values are node identifiers generated by makeNode().
  var propertyNodes = {};

  // Keys are node identifiers,
  // values are reactive functions.
  var reactiveFunctions = {};

  function getPropertyNode(property){
    if(property in propertyNodes){
      return propertyNodes[property];
    } else {
      return (propertyNodes[property] = makeNode());
    }
  }

  // Constructs the object to be passed into reactive function callbacks.
  // Returns an object with values for each inProperty of the given reactive function.
  function inPropertyValues(λ){
    var d = {};
    λ.inProperties.forEach(function (inProperty){
      d[inProperty] = simpleModel.get(inProperty);
    });
    return d;
  }
  
  // Constructs an array or values for each inProperty of the given reactive function.
  function inPropertyValuesArr(λ){
    return λ.inProperties.map(simpleModel.get);
  }

  // Returns true if all elements of the given array are defined, false otherwise.
  function allAreDefined(arr){
    return !arr.some(function (d) {
      return typeof d === "undefined" || d === null;
    });
  }
  
  function shouldVisit(node){
    if(node in reactiveFunctions){
      var λ = reactiveFunctions[node];
      return allAreDefined(inPropertyValuesArr(λ));
    } else {
      return true;
    }
  }

  var digest = debounce(function (){
    var properties = Object.keys(changedProperties);
    var sourceNodes = properties.map(getPropertyNode);
    var topologicallySorted = dependencyGraph
      .DFS(sourceNodes, shouldVisit)
      .reverse();

    topologicallySorted.forEach(function (node){
      if(node in reactiveFunctions){
        var λ = reactiveFunctions[node];
        var outPropertyValue = λ.callback(inPropertyValues(λ));
        simpleModel.setSilently(λ.outProperty, outPropertyValue);
      }
    });

    //console.log(topologicallySorted);

    // TODO test
    //changedProperties = {};
  });

  // Tracks a property if it is not already tracked.
  function track(property){
    if(!(property in trackedProperties)){
      trackedProperties[property] = true;

      if(property in model){
        simpleModel.set(property, model[property]);
      }

      Object.defineProperty(model, property, {
        get: function () {
          return simpleModel.get(property);
        },
        set: function(value) {
          return simpleModel.set(property, value);
        }
      });
    }
  }

  // The set of tracked properties. { property -> true }
  //var trackedProperties = {};
  model.react = function (options){

    // An array of ReactiveFunction objects parsed from options.
    ReactiveFunction.parse(options).forEach(function (λ){

      var λNode = makeNode();
      var outNode = getPropertyNode(λ.outProperty);

      reactiveFunctions[λNode] = λ;

      dependencyGraph.addEdge(λNode, outNode);

      track(λ.outProperty);

      λ.inProperties.forEach(function (inProperty){

        var inNode = getPropertyNode(inProperty);
        dependencyGraph.addEdge(inNode, λNode);

        simpleModel.on(inProperty, function (){
          changedProperties[inProperty] = true;
          digest();
        });

        track(inProperty);
      });
    });

    return reactiveFunctions;
  };

  return model;
}

export {
  ReactiveModel,
  SimpleModel,
  Graph,
  nextFrame
};
