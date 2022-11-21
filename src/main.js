// imports, declarations and midleware ===================================

const express = require('express');
const app = express()
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io')
const dotenv = require('dotenv').config()
const mongoose = require('mongoose');
const { UserModel, ItemModel, BidHistoryModel } = require('./schemas');
const { errorEmit } = require('./functions');

let onlineArray = [];
const httpServer = http.createServer(app);


async function dbConnect(link) {
  try {
    await mongoose.connect(link);
    console.log('db connected');
  } catch (error) {
    console.log('error ===', error);
  }
  return;
}

const io = new Server(httpServer, {
  cors: {
    origin: `http://localhost:3000`,
    methods: ["GET", "POST"],
  }
});

function logout(token) {
  onlineArray = onlineArray.filter((x) => x.socket !== token)
}

app.use(cors());
app.use(morgan('combined'));
dbConnect(process.env.DB_LINK);



// server engine =======================================================

io.on('connection', (socket) => {
  console.log('user connected: ', socket.id);

  socket.on('register', (userObj) => {
    console.log('registering');
    UserModel.find({ username: { $eq: userObj.username } })
      .then((result) => {
        if (result.length === 0) {
          console.log(result);
          const registerObj = new UserModel(userObj);
          registerObj.save();
        } else {
          throw new Error('this username already registered');
        };
      })
      .catch((err) => errorEmit(socket, err));
  });

  socket.on('login', (userObj) => {
    console.log('logging user', socket.id);
    UserModel.findOne({ username: { $eq: userObj.username }, password: { $eq: userObj.password } })
      .then((result) => {
        if (result) {
          const onlineToken = { socket: socket.id, username: result.username };
          if (onlineArray.find((x) => x.username === onlineToken.username)) {
            onlineArray.find((x) => x.username === onlineToken.username).socket = onlineToken.socket;
          }
          else onlineArray.push(onlineToken);
          socket.emit('logged', onlineToken);
        }
        else throw new Error('username or password invalid');
      })
      .catch((err) => errorEmit(socket, err));
  });

  socket.on('listRequest', async () => {
    const arr = await ItemModel.find();
    // { status: { $all: true } }
    socket.emit('listEmit', (arr ? arr : [{}]));
  });

  socket.on('listingSubmit', (submitObj) => {
    const addListing = new ItemModel(submitObj);
    // addListing.bidHistory = new BidHistoryModel({})
    addListing.save();
  });

  socket.on('reqSnglItem', (id) => {
    ItemModel.findOne({ _id: { $eq: id } })
      .then((item) => {
        if (item) {
          console.log('render');
          socket.emit('snglItemEmit', item)
        }
        else throw new Error('Issue with a listing')
      })
      .catch((err) => errorEmit(socket, err));
  });

  socket.on('attemptBid', async (bidObj) => {
    const item = {
      bidBy: bidObj.bidBy,
      bidAmmount: bidObj.bidAmmount,
      bidDate: bidObj.bidDate,
    }
    try {
      if (await ItemModel.findOne({ _id: { $eq: bidObj.id } }).then(x => x.currentBid < item.bidAmmount)) {
        await ItemModel.findOneAndUpdate({ _id: { $eq: bidObj.id } }, { $push: { bidHistory: item }, currentBid: item.bidAmmount, });
      } else throw new Error('bid is too low');
    } catch (error) {
      errorEmit(socket, error);
    }


  });

  socket.on('logout', () => logout(socket.id));
  socket.on('disconnect', () => logout(socket.id));
});





httpServer.listen(process.env.BACKEND_PORT, () => {
  console.log('Backend is working', process.env.BACKEND_PORT);
})
