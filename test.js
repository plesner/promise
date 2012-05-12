function runTests() {
  immediateTest(testAppendIndented);
  immediateTest(testReplaceCommonTrailingElements);
  immediateTest(testStripEmptyLines);
}

function immediateTest(thunk) {
  try {
    thunk();
    document.write("Succeeded: " + thunk.name + "</br>");
  } catch (e) {
    document.write("Failed " + thunk.name + ": " + e);
  }
}

function areDeepEquals(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length != b.length)
      return false;
    for (var i = 0; i < a.length; i++) {
      if (!areDeepEquals(a[i], b[i]))
        return false;
    }
    return true;
  } else {
    return (typeof a == typeof b) && (a == b);
  }
}

function assertDeepEquals(a, b) {
  if (!areDeepEquals(a, b))
    throw Error(a + " != " + b);
}

function testAppendIndented() {
  var aI = promise.trace.internal.appendIndented;
  assertDeepEquals(
    aI(["  foo", "  bar"], "baz"),
    ["  foo", "  bar", "  baz"]);
  assertDeepEquals(
    aI([], "baz"),
    ["baz"]);
  assertDeepEquals(
    aI(["a", " b", "  c"], "d"),
    ["a", " b", "  c", "  d"]);
}

function testReplaceCommonTrailingElements() {
  var rCTE = promise.trace.internal.replaceCommonTrailingElements;
  assertDeepEquals(
      rCTE(["a", "b", "c", "d", "e"], ["y", "z", "c", "d", "e"], "x"),
      ["y", "z", "c", "x"]);
  assertDeepEquals(
      rCTE(["a", "b", "c", "d", "e", "f"], ["y", "z", "c", "d", "e", "f"], "x"),
      ["y", "z", "c", "x"]);

  assertDeepEquals(
      rCTE(["a", "b", "c"], ["a", "b", "c"], "x"),
      ["a", "x"]);
  assertDeepEquals(
      rCTE(["d", "b", "c"], ["a", "b", "c"], "x"),
      ["a", "b", "x"]);
  assertDeepEquals(
      rCTE(["b", "c"], ["a", "b", "c"], "x"),
      ["a", "b", "x"]);
  assertDeepEquals(
      rCTE(["a", "b", "c"], ["b", "c"], "x"),
      ["b", "x"]);
  assertDeepEquals(
      rCTE([], ["a", "b", "c"], "x"),
      ["a", "b", "c"]);
}

function testStripEmptyLines() {
  var sEL = promise.trace.internal.stripEmptyLines;
  assertDeepEquals(sEL(["", "x", ""]), ["x"]);
  assertDeepEquals(sEL(["", ""]), []);
  assertDeepEquals(sEL([""]), []);
  assertDeepEquals(sEL([]), []);
  assertDeepEquals(sEL(["", "x", "", "y", ""]), ["x", "", "y"]);
}
