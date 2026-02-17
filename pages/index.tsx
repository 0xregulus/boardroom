import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";

import { BoardroomFooter } from "../src/features/boardroom/components/BoardroomFooter";
import { BoardroomHeader } from "../src/features/boardroom/components/BoardroomHeader";
import { BoardroomStageContent } from "../src/features/boardroom/components/BoardroomStageContent";
import { useBoardroomHomeController } from "../src/features/boardroom/hooks/useBoardroomHomeController";

export {
  buildCreateDraftFromStrategy,
  deriveRiskAdjustedRoi,
  deriveRiskAdjustedValue,
  deriveRiskScore,
  deriveWeightedCapitalScore,
  parseSectionMatrix,
} from "../src/features/boardroom/utils";

export const getServerSideProps: GetServerSideProps<{ tavilyConfigured: boolean }> = async () => ({
  props: {
    tavilyConfigured: (process.env.TAVILY_API_KEY ?? "").trim().length > 0,
  },
});

export default function Home({ tavilyConfigured }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { headerProps, stageContentProps, footerProps } = useBoardroomHomeController({
    tavilyConfigured,
  });

  return (
    <>
      <Head>
        <title>Boardroom</title>
        <meta name="description" content="Multi-Agent Workflow Engine" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </Head>

      <div className="boardroom-shell">
        <BoardroomHeader {...headerProps} />

        <section className="boardroom-main">
          <BoardroomStageContent {...stageContentProps} />
        </section>

        <BoardroomFooter {...footerProps} />
      </div>
    </>
  );
}
