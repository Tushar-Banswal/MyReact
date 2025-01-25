import MyReact from "./MyReact.js";

/** @jsx MyReact.createElement */
const container = document.getElementById("root");


const Counter = () => {
  const [counter, setCounter] = MyReact.useState(0);
  const increment = () => {
    setCounter(counter => counter + 1);
  }
  const decrement = () => {
    setCounter(counter => counter - 1);
  }
  return (
    <div>
      <h1>Count</h1>
      { counter }
      <br />
      <button onClick={increment}>+</button>
      <button onClick={decrement}>-</button>
    </div>
  )
}

const element = <div id="counter"><Counter /></div>

MyReact.render(element, container);