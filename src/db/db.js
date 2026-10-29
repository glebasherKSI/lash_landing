import { config } from '../config.js';
import { migrate, openDatabase } from './index.js';

export const db = openDatabase(config.dbFile);
migrate(db);
