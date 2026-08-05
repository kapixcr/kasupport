'use strict';

const { HttpError } = require('./errors');
const { readBearerToken } = require('./security');
const { authorizeMeetingActor, requireMeeting } = require('./store');

function runMiddleware(middleware, req, res) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(true);
    };
    res.once('finish', () => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    });
    try {
      const result = middleware(req, res, finish);
      if (result?.catch) result.catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

async function optionalAgent(req, res, requireAuth) {
  const token = readBearerToken(req);
  if (!token || !requireAuth) return null;

  const previousStatus = res.statusCode;
  const previousEnd = res.end;
  let bodySent = false;
  res.end = function blockedEnd() {
    bodySent = true;
  };
  try {
    const accepted = await runMiddleware(requireAuth, req, res);
    return accepted && req.agent ? req.agent : null;
  } finally {
    res.end = previousEnd;
    if (bodySent) res.statusCode = previousStatus;
  }
}

function createMeetingAuth({ db, requireAuth, verifyAgentToken, config }) {
  async function authenticate(req, res, { publicId = req.params.publicId, allowAgentCreate = false } = {}) {
    const meeting = await requireMeeting(db, publicId);
    const token = readBearerToken(req);
    let agent = req.agent || null;

    if (!agent && token && verifyAgentToken) {
      agent = await verifyAgentToken(token);
    } else if (!agent && token && requireAuth) {
      agent = await optionalAgent(req, res, requireAuth);
    }

    let participant;
    if (agent) {
      participant = await authorizeMeetingActor(db, meeting, {
        agent,
        pepper: config.guestTokenPepper,
        allowAgentCreate,
      });
    } else {
      participant = await authorizeMeetingActor(db, meeting, {
        guestToken: token,
        pepper: config.guestTokenPepper,
      });
    }
    req.meeting = meeting;
    req.meetingParticipant = participant;
    req.meetingAgent = agent;
    return { meeting, participant, agent };
  }

  function requireMeetingAuth(options = {}) {
    return async function meetingAuthMiddleware(req, res, next) {
      try {
        const auth = await authenticate(req, res, options);
        if (options.host && auth.participant.role !== 'host') {
          throw new HttpError(403, 'HOST_REQUIRED', 'se requiere ser anfitrión');
        }
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  return { authenticate, requireMeetingAuth };
}

module.exports = {
  createMeetingAuth,
  optionalAgent,
  runMiddleware,
};
