// A port that is not the tracker asking for a whole ticket to find a directory.
import { Ticket } from "./Ticketing.js";

export interface Gate {
  run(ticket: Ticket): Promise<boolean>;
}
