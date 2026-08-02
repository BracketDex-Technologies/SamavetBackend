type RequestLike = {
  url?: string;
};

type ResponseLike = {
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

type VercelHandler = (request: RequestLike, response: ResponseLike) => Promise<void>;

let handlerPromise: Promise<VercelHandler> | undefined;

async function getApiHandler(): Promise<VercelHandler> {
  if (!handlerPromise) {
    const apiHandlerPath = '../apps/api/api/index';
    handlerPromise = import(apiHandlerPath)
      .then((module) => (module as { default: VercelHandler }).default)
      .catch((error: unknown) => {
        handlerPromise = undefined;
        throw error;
      });
  }
  return handlerPromise;
}

export default async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
  if (request.url === '/' || request.url?.startsWith('/favicon.')) {
    response.status(200).json({
      status: 'ok',
      service: 'digital-mandal-api',
      docs: '/api/docs',
      health: '/api/v1/health',
    });
    return;
  }

  try {
    const apiHandler = await getApiHandler();
    await apiHandler(request, response);
  } catch (error) {
    console.error({ error: error instanceof Error ? error.name : 'UnknownError', event: 'api_entrypoint_failed' });
    response.status(500).json({
      error: 'API_ENTRYPOINT_FAILED',
      message: 'Digital Mandal API entrypoint could not start.',
    });
  }
}
