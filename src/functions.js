const errorEmit = (socket, error) => {
  socket.emit('error', { txt: error.message });
}

module.exports = {
  errorEmit,
}