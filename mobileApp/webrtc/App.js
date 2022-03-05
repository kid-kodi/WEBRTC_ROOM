import {
  Dimensions,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import React from 'react';

import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  MediaStream,
  MediaStreamTrack,
  mediaDevices,
  registerGlobals,
} from 'react-native-webrtc';

import io from 'socket.io-client';

const dimensions = Dimensions.get('window');

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      localStream: null,
      remoteStream: null,
    };

    this.sdp;
    this.socket = null;
    this.candidates = null;
  }

  componentDidMount = () => {
    this.socket = this.socket = io(
      'https://357c-196-47-128-181.ngrok.io/webrtcPeer',
      {path: '/webrtc', query: {}},
    );

    this.socket.on('connection-success', success => {
      console.log('Connection success', success);
    });

    this.socket.on('offerOrAnswer', sdp => {
      this.sdp = JSON.stringify(sdp);
      this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    });

    this.socket.on('candidate', candidate => {
      // this.candidates = [...this.candidates, candidate];
      this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    const pc_config = {
      iceServers: [{urls: 'stun:stun.l.google.com:19302'}],
    };

    this.pc = new RTCPeerConnection(pc_config);

    this.pc.onicecandidate = e => {
      if (e.candidate) {
        // console.log(JSON.stringify(e.candidate));
        this.sendToPeer('candidate', e.candidate);
      }
    };

    this.pc.oniceconnectionstatechange = e => {
      console.log(JSON.stringify(e));
    };

    this.pc.onaddstream = e => {
      this.setState({
        remoteStream: e.stream,
      });
    };

    const success = stream => {
      this.setState({
        localStream: stream,
      });
      this.pc.addStream(stream);
    };

    const failure = e => {
      console.error('getUserMedia Error: ', e);
    };

    let isFront = true;
    mediaDevices.enumerateDevices().then(sourceInfos => {
      console.log(sourceInfos);
      let videoSourceId;
      for (let i = 0; i < sourceInfos.length; i++) {
        const sourceInfo = sourceInfos[i];
        if (
          sourceInfo.kind == 'videoinput' &&
          sourceInfo.facing == (isFront ? 'front' : 'environment')
        ) {
          videoSourceId = sourceInfo.deviceId;
        }
      }
      mediaDevices
        .getUserMedia({
          audio: true,
          video: false,
        })
        .then(success)
        .catch(failure);
    });
  };

  sendToPeer = (messageType, payload) => {
    this.socket.emit(messageType, {socketID: this.socket.id, payload});
  };

  createOffer = () => {
    console.log('Offer');
    this.pc.createOffer({offerToReceiveVideo: 1}).then(
      sdp => {
        // console.log(JSON.stringify(sdp));
        this.pc.setLocalDescription(sdp);
        this.sendToPeer('offerOrAnswer', sdp);
      },
      e => {},
    );
  };

  setRemoteDescription = () => {
    const desc = JSON.parse(this.sdp);
    this.pc.setRemoteDescription(new RTCSessionDescription(desc));
  };

  createAnswer = () => {
    console.log('Answer');
    this.pc.createAnswer({offerToReceiveVideo: 1}).then(sdp => {
      // console.log(JSON.stringify(sdp));
      this.pc.setLocalDescription(sdp);
      this.sendToPeer('offerOrAnswer', sdp);
    });
  };

  // addCandidate = () => {
  //   // const candidate = JSON.parse(this.textRef.value);
  //   // console.log("Adding candidate.", candidate);
  //   // this.pc.addIceCandidate(new RTCIceCandidate(candidate));

  //   this.candidates.forEach((candidate) => {
  //     console.log(candidate);
  //     this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  //   });
  // };

  render() {
    const {localStream, remoteStream} = this.state;
    const remoteVideo = remoteStream ? (
      <RTCView
        key={2}
        mirror={true}
        style={{...styles.rtcViewRemote}}
        objectFit="contain"
        streamURL={remoteStream && remoteStream.toURL()}
      />
    ) : (
      <View style={{padding: 15}}>
        <Text style={{fontSize: 22, textAlign: 'center', color: 'white'}}>
          Waitin for peer connection
        </Text>
      </View>
    );
    return (
      <SafeAreaView style={{flex: 1}}>
        <View style={{...styles.buttonsContainer}}>
          <View style={{flex: 1}}>
            <TouchableOpacity onPress={this.createOffer}>
              <View style={styles.button}>
                <Text style={{...styles.textContent}}>Call</Text>
              </View>
            </TouchableOpacity>
          </View>
          <View style={{flex: 1, padding: 15}}>
            <TouchableOpacity onPress={this.createAnswer}>
              <Text style={{...styles.textContent}}>Answer</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={{...styles.videosContainer}}>
          <View
            style={{
              position: 'absolute',
              backgroundColor: 'black',
              width: 100,
              height: 200,
              bottom: 10,
              right: 10,
              zIndex: 1000,
            }}>
            <View style={{flex: 1}}>
              <TouchableOpacity onPress={() => {}}>
                <View>
                  <RTCView
                    key={1}
                    zOrder={0}
                    objectFit="cover"
                    style={{...styles.rtcView}}
                    streamURL={localStream && localStream.toURL()}
                  />
                </View>
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView style={{...styles.scrollView}}>
            <View
              styles={{
                flex: 1,
                width: '100%',
                backgroundColor: 'black',
                justifyContent: 'center',
                alignItems: 'center',
              }}>
              {remoteVideo}
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  buttonsContainer: {flexDirection: 'row'},
  button: {
    margin: 5,
    paddingVertical: 10,
    backgroundColor: 'lightgrey',
    borderRadius: 5,
  },
  textContent: {
    fontFamily: 'Avenir',
    fontSize: 20,
    textAlign: 'center',
  },
  videosContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  rtcView: {
    width: 100,
    height: 200,
    backgroundColor: 'black',
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'teal',
    padding: 15,
  },
  rtcViewRemote: {
    width: '100%',
    height: 500,
    backgroundColor: 'black',
  },
});

export default App;
