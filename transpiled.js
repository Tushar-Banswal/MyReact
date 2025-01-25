import MyReact from "./MyReact.js";

/** @jsx MyReact.createElement */
const container = document.getElementById("root");
const Counter = () => {
  const [counter, setCounter] = MyReact.useState(0);
  const increment = () => {
    setCounter(counter => counter + 1);
  };
  const decrement = () => {
    setCounter(counter => counter - 1);
  };
  return MyReact.createElement("div", null, MyReact.createElement("h1", null, "Count"), counter, MyReact.createElement("br", null), MyReact.createElement("button", {
    onClick: increment
  }, "+"), MyReact.createElement("button", {
    onClick: decrement
  }, "-"));
};
const element = MyReact.createElement("div", {
  id: "counter"
}, MyReact.createElement(Counter, null));
MyReact.render(element, container);
