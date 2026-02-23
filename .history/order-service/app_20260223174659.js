const express = require("express");
const app = express();

app.get("/orders", (req, res) => {
  res.json([
    { id: 101, item: "Cement Bags" },
    { id: 102, item: "Steel Rods" }
  ]);
});

app.get("/health",(req,res)=>{
  res.json({status:"UP"});
});

app.listen(3002, () => console.log("Order service running"));
