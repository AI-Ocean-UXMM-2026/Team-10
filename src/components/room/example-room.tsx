import { RoomScene } from './room-scene';
import { exampleRoom } from './example-layout';

export function ExampleRoom() {
  return <figure className="example-room"><RoomScene room={exampleRoom} /><figcaption>Make a space of your own</figcaption></figure>;
}
