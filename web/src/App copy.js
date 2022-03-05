import "./App.css";
import React, { Component, useEffect, useRef, useState } from "react";

import io from "socket.io-client";
import Video from "./components/Video";
import Videos from "./components/Videos";

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      localStream: null,
      remoteStream: null,
      remoteStreams: [],
      peerConnections: [],
      selectedVideo: null,
      status: "Please wait...",
      pc_config: {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      },
      sdpConstraints: {
        mandatory: {
          OfferToReceiveAudio: true,
          OfferToReceiveVideo: true,
        },
      },
    };

    // this.localVideoref = React.createRef();
    // this.remoteVideoref = React.createRef();
    this.serviceIP = "https://5cea-196-47-128-163.ngrok.io/webrtcPeer";
    // this.textRef = React.createRef();
    this.socket = null;
    // this.candidates = [];
  }

  componentDidMount() {
    this.socket = io(this.serviceIP, {
      path: "/webrtc",
      query: {},
    });

    this.socket.on("connection-success", (data) => {
      this.getLocalStream();
      console.log("Connection success", data.success);
      const status =
        data.peerCount > 1
          ? `Total connected peers ${data.peerCount}`
          : `Waiting for others peers to connect`;

      this.setState({
        status: status,
      });
    });

    this.socket.on("peer-disconnected", (data) => {
      console.log("peer-disconnected", data);

      const remoteStreams = this.state.remoteStreams.filter(
        (stream) => stream.id !== data.socketID
      );

      this.setState((prevState) => {
        const selectedVideo =
          prevState.selectedVideo.id === data.socketID && remoteStreams.length
            ? { selectedVideo: remoteStreams[0] }
            : null;
        return {
          remoteStreams,
          ...selectedVideo,
        };
      });
    });

    // this.socket.on("offerOrAnswer", (sdp) => {
    //   this.textRef.value = JSON.stringify(sdp);
    //   this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    // });

    this.socket.on("online-peer", (socketID) => {
      console.log("connected peers ...", socketID);

      // 1. create new peer
      this.createPeerConnection(socketID, (pc) => {
        // 2. Create offer.
        if (pc) {
          pc.createOffer(this.state.sdpConstraints).then((sdp) => {
            pc.setLocalDescription(sdp);
            this.sendToPeer("offer", sdp, {
              local: this.socket.id,
              remote: socketID,
            });
          });
        }
      });
    });

    this.socket.on("offer", (data) => {
      // 1. create new peer
      this.createPeerConnection(data.socketID, (pc) => {
        pc.addStream(this.state.localStream);
        pc.setRemoteDescription(new RTCSessionDescription(data.sdp)).then(
          () => {
            pc.createAnswer(this.state.sdpConstraints).then((sdp) => {
              pc.setLocalDescription(sdp);
              this.sendToPeer("answer", sdp, {
                local: this.socket.id,
                remote: data.socketID,
              });
            });
          }
        );
      });
    });

    this.socket.on("answer", (data) => {
      const pc = this.state.peerConnections[data.socketID];
      pc.setRemoteDescription(new RTCSessionDescription(data.sdp)).then(
        () => {}
      );
    });

    this.socket.on("candidate", (data) => {
      const pc = this.state.peerConnections[data.socketID];
      if (pc) pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    });

    // this.pc = new RTCPeerConnection(this.state.pc_config);

    // this.pc.onicecandidate = (e) => {
    //   if (e.candidate) {
    //     // console.log(JSON.stringify(e.candidate));
    //     this.sendToPeer("candidate", e.candidate);
    //   }
    // };

    // this.pc.oniceconnectionstatechange = (e) => {
    //   console.log(JSON.stringify(e));
    // };

    // this.pc.onaddstream = (e) => {
    //   // this.remoteVideoref.current.srcObject = e.stream;
    //   this.setState({ remoteStream: e.stream });
    // };
  }

  getLocalStream = () => {
    const success = (stream) => {
      window.localStream = stream;
      // this.localVideoref.current.srcObject = stream;
      // this.pc.addStream(stream);
      this.setState({ localStream: stream });

      this.whoisOnline();
    };

    const failure = (e) => {
      console.error("getUserMedia Error: ", e);
    };

    const constraints = {
      audio: false,
      video: true,
      // video: {
      //   width: 1280,
      //   height: 720
      // },
      // video: {
      //   width: { min: 1280 },
      // }
      options: {
        mirror: true,
      },
    };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then(success)
      .catch(failure);
  };

  whoisOnline = () => {
    this.sendToPeer("onlinePeers", null, { local: this.socket.id });
  };

  sendToPeer = (messageType, payload, socketID) => {
    this.socket.emit(messageType, { socketID, payload });
  };

  createPeerConnection = (socketID, callback) => {
    try {
      let pc = new RTCPeerConnection(this.state.pc_config);
      const peerConnections = { ...this.state.peerConnections, [socketID]: pc };
      this.setState({ peerConnections });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.sendToPeer("candidate", e.candidate, {
            local: this.socket.id,
            remote: socketID,
          });
        }
      };

      pc.oniceconnectionstatechange = (e) => {
        // if (pc.iceConnectionState === "disconnected") {
        //   const remoteStreams = this.state.remoteStreams.filter(
        //     (stream) => stream.id !== socketID
        //   );
        //   this.setState({
        //     remoteStreams:
        //       (remoteStreams.length > 0 && remoteStreams[0].stream) || null,
        //   });
        // }
      };

      pc.ontrack = (e) => {
        const remoteVideo = {
          id: socketID,
          name: socketID,
          stream: e.streams[0],
        };

        this.setState((prevState) => {
          const remoteStream =
            prevState.remoteStreams.length > 0
              ? {}
              : { remoteStream: e.streams[0] };

          let selectedVideo = prevState.remoteStreams.filter(
            (stream) => stream.id === prevState.selectedVideo.id
          );

          selectedVideo = selectedVideo.length
            ? {}
            : { selectedVideo: remoteVideo };

          return {
            ...selectedVideo,
            ...remoteStream,
            remoteStreams: [...prevState.remoteStreams, remoteVideo],
          };
        });
      };

      pc.close = () => {};

      if (this.state.localStream) pc.addStream(this.state.localStream);
      // return pc;
      callback(pc);
    } catch (error) {
      console.log("Something went wrong! pc not created", error);
      callback(null);
    }
  };

  // createOffer = () => {
  //   console.log("Offer");
  //   this.pc.createOffer(this.state.sdpConstraints).then(
  //     (sdp) => {
  //       // console.log(JSON.stringify(sdp));
  //       this.pc.setLocalDescription(sdp);
  //       this.sendToPeer("offerOrAnswer", sdp);
  //     },
  //     (e) => {}
  //   );
  // };

  // createAnswer = () => {
  //   console.log("Answer");
  //   this.pc.createAnswer(this.state.sdpConstraints).then((sdp) => {
  //     // console.log(JSON.stringify(sdp));
  //     this.pc.setLocalDescription(sdp);
  //     this.sendToPeer("offerOrAnswer", sdp);
  //   });
  // };

  switchVideo = (_video) => {
    console.log("selected video ", _video);
    this.setState({ selectedVideo: _video });
  };

  render() {
    const statusText = (
      <div style={{ color: "yellow", padding: 5 }}>{this.state.status}</div>
    );
    return (
      <div>
        <Video
          videoStyle={{
            zIndex: 2,
            position: "absolute",
            right: 0,
            width: 200,
            height: 200,
            margin: 5,
            backgroundColor: "black",
          }}
          videoStream={this.state.localStream}
          autoPlay
          muted
        />
        <Video
          videoStyle={{
            zIndex: 1,
            position: "fixed",
            bottom: 0,
            minWidth: "100%",
            minHeight: "100%",
            backgroundColor: "black",
          }}
          videoStream={
            this.state.selectedVideo && this.state.selectedVideo.stream
          }
          autoPlay
        />
        <br />
        <div
          style={{
            zIndex: 3,
            position: "absolute",
            margin: 10,
            backgroundColor: "#cdc4ff4f",
            padding: 10,
            borderRadius: 5,
          }}
        >
          {statusText}
        </div>
        <div>
          <Videos
            switchVideo={this.switchVideo}
            remoteStream={this.state.remoteStreams}
          />
        </div>
        {/* <div style={{ zIndex: 1, position: "fixed" }}>
          <button onClick={this.createOffer}>Offer</button>
          <button onClick={this.createAnswer}>Answer</button>
          <br />
          <textarea
            ref={(ref) => {
              this.textRef = ref;
            }}
          />
        </div> */}
      </div>
    );
  }
}

export default App;
